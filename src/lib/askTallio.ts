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
  const last30 = bills.filter((b) => {
    const ms = toMs(b.createdAt);
    return ms != null && now - ms <= 30 * DAY;
  });
  const rev30 = last30.reduce((s, b) => s + (b.total || 0), 0);

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

export async function askTallio(
  context: string,
  history: ChatTurn[],
  question: string
): Promise<string> {
  if (!API_KEY) throw new Error('AI is not configured');

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction:
      `You are "Tallio", a friendly, concise business analyst assistant built into a ` +
      `point-of-sale app for small businesses. Answer questions using ONLY the business ` +
      `data provided below. If the data doesn't contain the answer, say so honestly and ` +
      `suggest what the user could track to get it. Keep answers short and practical, use ` +
      `the business's currency symbol, and format numbers clearly. Do not invent figures.\n\n` +
      `=== BUSINESS DATA SNAPSHOT ===\n${context}\n=== END DATA ===`,
  });

  const chat = model.startChat({
    history: history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
  });

  const result = await chat.sendMessage(question);
  return result.response.text();
}
