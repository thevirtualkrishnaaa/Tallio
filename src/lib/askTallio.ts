import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildInsights, toMs } from './insights';
import type { Bill, Product, Customer, Organization, Expense } from '../types';
import { errorMessage } from './errors';

const STORAGE_KEY = 'tallio:gemini_key';
const MODEL_NAME = 'gemini-2.5-flash';

// Retrieve Gemini API key from environment variable or localStorage
export function getGeminiApiKey(): string | null {
  const envKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }
  try {
    const localKey = localStorage.getItem(STORAGE_KEY);
    if (localKey && localKey.trim()) {
      return localKey.trim();
    }
  } catch {
    // localStorage might be unavailable in private browsing
  }
  return null;
}

// Persist or clear Gemini API key in localStorage
export function setGeminiApiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // storage unavailable
  }
}

// Check if Gemini API key is configured
export function isAiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

// Build a compact, factual snapshot of the business for grounding.
export function buildBusinessContext(
  org: Organization,
  bills: Bill[],
  products: Product[],
  customers: Customer[],
  expenses: Expense[] = []
): string {
  const sym = org.currency.symbol;
  const now = Date.now();
  const DAY = 86_400_000;

  const totalRevenue = bills.reduce((s, b) => s + (b.total || 0), 0);
  const totalCogs = bills.reduce(
    (s, b) => s + (b.items || []).reduce((is, i) => is + (i.unitCost || 0) * i.quantity, 0),
    0
  );
  const totalGrossProfit = bills.reduce(
    (s, b) => s + (b.items || []).reduce((is, i) => is + (i.unitPrice - (i.unitCost || 0)) * i.quantity, 0),
    0
  );
  const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const netProfit = totalGrossProfit - totalExpenses;

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

  const report = buildInsights(bills, products, customers, sym, expenses);

  const lines: string[] = [];
  lines.push(`Business name: ${org.name}`);
  lines.push(`Currency: ${org.currency.code} (${sym})`);
  lines.push(`Total bills recorded: ${bills.length}`);
  lines.push(`All-time revenue: ${sym}${totalRevenue.toFixed(2)}`);
  lines.push(`All-time cost of goods sold: ${sym}${totalCogs.toFixed(2)}`);
  lines.push(`All-time gross profit: ${sym}${totalGrossProfit.toFixed(2)}`);
  lines.push(`All-time operating expenses: ${sym}${totalExpenses.toFixed(2)} (${expenses.length} entries)`);
  lines.push(`All-time net profit: ${sym}${netProfit.toFixed(2)}`);
  lines.push(`Revenue in last 30 days: ${sym}${rev30.toFixed(2)} across ${last30.length} bills`);
  lines.push(`Total products in catalogue: ${products.length}`);
  lines.push(`Total customers: ${customers.length}`);

  if (expenses.length > 0) {
    const expCatMap = new Map<string, number>();
    expenses.forEach((e) => {
      const cur = expCatMap.get(e.category) || 0;
      expCatMap.set(e.category, cur + (Number(e.amount) || 0));
    });
    lines.push('');
    lines.push('EXPENSES BY CATEGORY:');
    expCatMap.forEach((amt, cat) => {
      lines.push(`  - ${cat}: ${sym}${amt.toFixed(2)}`);
    });
  }

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

const DATA_RULES =
  `Use ONLY the business data provided below. Never invent or estimate figures that ` +
  `are not derivable from it. If the data does not contain the answer, say so honestly ` +
  `and suggest what the user could start tracking to get it. Always use the business's ` +
  `own currency symbol. Reply in PLAIN TEXT only — no markdown, no asterisks, hashes or ` +
  `backticks. For lists, start lines with "- ".`;

const CHAT_SYSTEM =
  `You are "Tallio", a friendly, concise business analyst assistant built into a ` +
  `point-of-sale app for small businesses. Keep answers short, practical, and grounded in the data. ` +
  `Format numbers clearly. ${DATA_RULES}`;

const INSIGHTS_SYSTEM =
  `You are "Tallio", a sharp, practical business analyst working for the owner of a small ` +
  `business. You are writing the analyst briefing shown on their Insights page — the one ` +
  `piece of writing they read before deciding what to do this week.\n\n` +
  `${DATA_RULES}\n\n` +
  `What makes a good briefing:\n` +
  `- Every claim carries a real number from the data — revenue, quantity, product name, ` +
  `day, or day-count. A claim without a number is not worth printing.\n` +
  `- Look for what a simple dashboard misses: trends across weeks and months, products ` +
  `quietly rising or fading, day-of-week patterns, stock that runs out before it can ` +
  `realistically be reordered, revenue concentrated in too few customers or products, ` +
  `catalogue dead weight, operating overheads/expenses, and margin (selling price versus cost).\n` +
  `- Be specific to THIS business. No generic small-business advice.\n` +
  `- Say plainly when the history is too short to call a trend, instead of overreaching.\n\n` +
  `Reply in EXACTLY this structure, using these literal section labels on their own lines:\n\n` +
  `SUMMARY:\n` +
  `Two to four sentences on how the business is doing right now and the single most ` +
  `important thing to notice.\n\n` +
  `FINDINGS:\n` +
  `- [positive] Short title :: One or two sentences with the numbers behind it\n` +
  `- [warning] Short title :: One or two sentences with the numbers behind it\n` +
  `- [neutral] Short title :: One or two sentences with the numbers behind it\n` +
  `Give three to five findings. The tone tag must be exactly positive, warning or neutral, ` +
  `and every finding must use the " :: " separator between title and detail.\n\n` +
  `ACTIONS:\n` +
  `- A specific thing to do this week, tied to a finding above\n` +
  `Give two to four actions.`;

// 'chat' powers the Ask Tallio page; 'insights' asks for the structured
// analyst briefing rendered on the Insights page.
export type AskMode = 'chat' | 'insights';

// Calls Google Gemini directly using the configured API key
export async function askTallio(
  context: string,
  history: ChatTurn[],
  question: string,
  mode: AskMode = 'chat'
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Please configure your Google Gemini API key to use Tallio AI.');
  }

  const insightsMode = mode === 'insights';
  const genAI = new GoogleGenerativeAI(apiKey);

  const systemInstruction =
    `${insightsMode ? INSIGHTS_SYSTEM : CHAT_SYSTEM}\n\n` +
    `=== BUSINESS DATA SNAPSHOT ===\n${context ?? ''}\n=== END DATA ===`;

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction,
    generationConfig: {
      maxOutputTokens: insightsMode ? 1600 : 1024,
      temperature: 0.2,
    },
  });

  try {
    if (insightsMode) {
      const result = await model.generateContent(question);
      return stripMarkdown(result.response.text());
    } else {
      const formattedHistory = (Array.isArray(history) ? history : [])
        .filter((h) => h && typeof h.text === 'string')
        .map((h) => ({
          role: h.role === 'model' ? ('model' as const) : ('user' as const),
          parts: [{ text: h.text }],
        }));

      const chat = model.startChat({
        history: formattedHistory,
      });

      const result = await chat.sendMessage(question);
      return stripMarkdown(result.response.text());
    }
  } catch (e: unknown) {
    console.error('Gemini error:', e);
    throw new Error(
      errorMessage(e, 'Tallio AI is unavailable right now — please check your API key and try again.'),
      { cause: e }
    );
  }
}
