// "Ask Tallio" — conversational AI grounded in the org's own data.
// Uses Google Gemini (free tier) via @google/generative-ai.
//
// NOTE: the API key is read from import.meta.env.VITE_GEMINI_API_KEY and is
// bundled client-side. That's acceptable for an MVP/demo. Before a real
// launch, move this call behind a Firebase Cloud Function so the key stays
// server-side.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildInsights } from './insights';
import type { Bill, Product, Customer, Organization } from '../types';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

export function isAiConfigured(): boolean {
  return !!API_KEY && API_KEY.length > 10;
}

function toMs(ts: any): number | null {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return null;
}

// Build a compact, factual snapshot of the business for grounding.
export function buildBusinessContext(
  org: Organization,
  bills: Bill[],
  products: Product[],
  customers: Customer[]
): string {
  const sym = org.currency.symbol;
  const now = Date.now();
  const DAY = 86_400_000;

  const totalRevenue = bills.reduce((s, b) => s + (b.total || 0), 0);
  const billsWithTime = bills
    .map((b) => ({ bill: b, ms: toMs(b.createdAt) }))
    .filter((x): x is { bill: Bill; ms: number } => x.ms != null);

  const last30 = billsWithTime.filter((x) => now - x.ms <= 30 * DAY);
  const rev30 = last30.reduce((s, x) => s + (x.bill.total || 0), 0);

  // Week-over-week comparison
  const thisWeek = billsWithTime.filter((x) => now - x.ms <= 7 * DAY);
  const lastWeek = billsWithTime.filter((x) => now - x.ms > 7 * DAY && now - x.ms <= 14 * DAY);
  const revThisWeek = thisWeek.reduce((s, x) => s + (x.bill.total || 0), 0);
  const revLastWeek = lastWeek.reduce((s, x) => s + (x.bill.total || 0), 0);

  // Daily revenue for the last 14 days
  const daily = new Map<string, { revenue: number; count: number }>();
  billsWithTime
    .filter((x) => now - x.ms <= 14 * DAY)
    .forEach((x) => {
      const d = new Date(x.ms);
      const key = d.toISOString().slice(0, 10) + ` (${d.toLocaleDateString('en-GB', { weekday: 'short' })})`;
      const cur = daily.get(key) || { revenue: 0, count: 0 };
      cur.revenue += x.bill.total || 0;
      cur.count += 1;
      daily.set(key, cur);
    });

  // What sold this week vs last week, per product
  const weekProducts = (arr: typeof billsWithTime) => {
    const m = new Map<string, { qty: number; revenue: number }>();
    arr.forEach((x) =>
      (x.bill.items || []).forEach((i) => {
        const cur = m.get(i.name) || { qty: 0, revenue: 0 };
        cur.qty += i.quantity;
        cur.revenue += i.total;
        m.set(i.name, cur);
      })
    );
    return m;
  };
  const thisWeekProd = weekProducts(thisWeek);
  const lastWeekProd = weekProducts(lastWeek);

  // Top products by revenue
  const prodMap = new Map<string, { name: string; qty: number; revenue: number }>();
  bills.forEach((b) =>
    (b.items || []).forEach((i) => {
      const k = i.productId || i.name;
      const cur = prodMap.get(k) || { name: i.name, qty: 0, revenue: 0 };
      cur.qty += i.quantity;
      cur.revenue += i.total;
      prodMap.set(k, cur);
    })
  );
  const topProducts = Array.from(prodMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const report = buildInsights(bills, products, customers, sym);

  const lines: string[] = [];
  lines.push(`Business name: ${org.name}`);
  lines.push(`Currency: ${org.currency.code} (${sym})`);
  lines.push(`Total bills recorded: ${bills.length}`);
  lines.push(`All-time revenue: ${sym}${totalRevenue.toFixed(2)}`);
  lines.push(`Revenue in last 30 days: ${sym}${rev30.toFixed(2)} across ${last30.length} bills`);
  lines.push(`Total products in catalogue: ${products.length}`);
  lines.push(`Total customers: ${customers.length}`);

  // Monthly revenue across full history
  const monthly = new Map<string, { revenue: number; count: number }>();
  billsWithTime.forEach((x) => {
    const d = new Date(x.ms);
    const key = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const cur = monthly.get(key) || { revenue: 0, count: 0 };
    cur.revenue += x.bill.total || 0;
    cur.count += 1;
    monthly.set(key, cur);
  });
  if (monthly.size > 0) {
    lines.push('');
    lines.push('MONTHLY REVENUE:');
    monthly.forEach((m, key) =>
      lines.push(`  ${key}: ${sym}${m.revenue.toFixed(2)} across ${m.count} bills`)
    );
  }

  // Per-product qty by month (to expose rising/declining trends)
  const prodMonthly = new Map<string, Map<string, number>>();
  billsWithTime.forEach((x) => {
    const d = new Date(x.ms);
    const mk = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    (x.bill.items || []).forEach((i) => {
      const m = prodMonthly.get(i.name) || new Map<string, number>();
      m.set(mk, (m.get(mk) || 0) + i.quantity);
      prodMonthly.set(i.name, m);
    });
  });
  if (prodMonthly.size > 0) {
    lines.push('');
    lines.push('PRODUCT QUANTITY SOLD PER MONTH:');
    prodMonthly.forEach((m, name) => {
      const parts = Array.from(m.entries()).map(([mk, q]) => `${mk}: ${q}`);
      lines.push(`  - ${name}: ${parts.join(', ')}`);
    });
  }

  lines.push('');
  lines.push('WEEK-OVER-WEEK REVENUE:');
  lines.push(`  This week (last 7 days): ${sym}${revThisWeek.toFixed(2)} across ${thisWeek.length} bills`);
  lines.push(`  Last week (7-14 days ago): ${sym}${revLastWeek.toFixed(2)} across ${lastWeek.length} bills`);
  if (revLastWeek > 0) {
    const change = ((revThisWeek - revLastWeek) / revLastWeek) * 100;
    lines.push(`  Change: ${change >= 0 ? '+' : ''}${change.toFixed(1)}%`);
  }

  if (daily.size > 0) {
    lines.push('');
    lines.push('DAILY REVENUE (LAST 14 DAYS):');
    Array.from(daily.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([day, d]) =>
        lines.push(`  ${day}: ${sym}${d.revenue.toFixed(2)} (${d.count} bill${d.count === 1 ? '' : 's'})`)
      );
  }

  if (thisWeekProd.size > 0 || lastWeekProd.size > 0) {
    lines.push('');
    lines.push('PRODUCT SALES THIS WEEK vs LAST WEEK (qty sold):');
    const names = new Set([...thisWeekProd.keys(), ...lastWeekProd.keys()]);
    names.forEach((name) => {
      const tw = thisWeekProd.get(name);
      const lw = lastWeekProd.get(name);
      lines.push(`  - ${name}: this week ${tw?.qty ?? 0}, last week ${lw?.qty ?? 0}`);
    });
  }

  lines.push('');
  lines.push('TOP PRODUCTS BY REVENUE:');
  topProducts.forEach((p, i) =>
    lines.push(`  ${i + 1}. ${p.name} — ${p.qty} sold, ${sym}${p.revenue.toFixed(2)} revenue`)
  );

  lines.push('');
  lines.push('CURRENT STOCK LEVELS:');
  products.slice(0, 40).forEach((p) =>
    lines.push(`  - ${p.name}: ${p.stock} ${p.unit} (price ${sym}${Number(p.price).toFixed(2)}, cost ${sym}${Number(p.cost || 0).toFixed(2)})`)
  );

  if (report.restock.length > 0) {
    lines.push('');
    lines.push('RESTOCK ALERTS:');
    report.restock.forEach((r) =>
      lines.push(
        `  - ${r.name}: ${r.stock} ${r.unit} left${
          r.daysLeft !== null ? `, ~${Math.ceil(r.daysLeft)} days until out` : ''
        } [${r.urgency}]`
      )
    );
  }

  if (customers.length > 0) {
    const top = [...customers].sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0)).slice(0, 5);
    lines.push('');
    lines.push('TOP CUSTOMERS:');
    top.forEach((c) => lines.push(`  - ${c.name}: ${sym}${(c.totalSpend || 0).toFixed(2)} lifetime spend`));
  }

  return lines.join('\n');
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

// Safety net: remove markdown syntax if the model uses it despite instructions
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')        // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // bold
    .replace(/\*([^*\n]+)\*/g, '$1')    // italic
    .replace(/__([^_]+)__/g, '$1')      // bold (underscore)
    .replace(/`([^`]+)`/g, '$1')        // inline code
    .replace(/^\s*[*•]\s+/gm, '- ')     // bullets → dashes
    .replace(/^---+$/gm, '')            // horizontal rules
    .replace(/\n{3,}/g, '\n\n')         // collapse extra blank lines
    .trim();
}

// Tried in order — if one model is overloaded (503) or out of quota (429),
// the next one is attempted automatically.
const MODEL_FALLBACKS = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

export async function askTallio(
  context: string,
  history: ChatTurn[],
  question: string
): Promise<string> {
  if (!API_KEY) throw new Error('AI is not configured');

  const genAI = new GoogleGenerativeAI(API_KEY);
  const systemInstruction =
    `You are "Tallio", a friendly, concise business analyst assistant built into a ` +
    `point-of-sale app for small businesses. Answer questions using ONLY the business ` +
    `data provided below. If the data doesn't contain the answer, say so honestly and ` +
    `suggest what the user could track to get it. Keep answers short and practical, use ` +
    `the business's currency symbol, and format numbers clearly. Do not invent figures. ` +
    `IMPORTANT: reply in PLAIN TEXT only — no markdown. Never use asterisks, hashes, ` +
    `backticks or underscores. For lists, start lines with "- ". For emphasis, just use ` +
    `clear wording. Blank lines between sections are fine.\n\n` +
    `=== BUSINESS DATA SNAPSHOT ===\n${context}\n=== END DATA ===`;

  let lastError: any = null;
  for (const modelName of MODEL_FALLBACKS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });
      const chat = model.startChat({
        history: history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
      });
      const result = await chat.sendMessage(question);
      return stripMarkdown(result.response.text());
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || '');
      // Only fall through on capacity/quota errors; anything else is real.
      if (!msg.includes('503') && !msg.includes('429') && !msg.includes('404')) throw e;
    }
  }
  throw lastError ?? new Error('All AI models are busy — please try again in a moment.');
}
