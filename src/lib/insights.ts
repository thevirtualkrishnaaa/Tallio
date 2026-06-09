// Local "AI-style" analytics engine — turns raw bills/products into
// natural-language insights and restock predictions. No external API:
// fast, free, and works offline. The LLM-powered "Ask Tallio" chat
// is a separate layer that builds on the same computed facts.

import type { Bill, Product, Customer } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(ts: any): number | null {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return null;
}

export interface RestockAlert {
  productId: string;
  name: string;
  stock: number;
  unit: string;
  dailyVelocity: number;   // avg units sold per day
  daysLeft: number | null; // null = no sales velocity yet
  urgency: 'critical' | 'soon' | 'ok';
}

export interface Insight {
  id: string;
  tone: 'positive' | 'warning' | 'neutral';
  text: string;
}

export interface InsightReport {
  insights: Insight[];
  restock: RestockAlert[];
  hasData: boolean;
}

export function buildInsights(
  bills: Bill[],
  products: Product[],
  customers: Customer[],
  currencySymbol: string
): InsightReport {
  const now = Date.now();
  const cur = (n: number) => `${currencySymbol}${n.toFixed(2)}`;

  // ── Time-bounded slices ───────────────────────────────────────────────
  const billsWithTime = bills
    .map((b) => ({ bill: b, ms: toMs(b.createdAt) }))
    .filter((x): x is { bill: Bill; ms: number } => x.ms != null);

  const last7 = billsWithTime.filter((x) => now - x.ms <= 7 * DAY_MS);
  const prev7 = billsWithTime.filter((x) => now - x.ms > 7 * DAY_MS && now - x.ms <= 14 * DAY_MS);

  const rev = (arr: typeof billsWithTime) => arr.reduce((s, x) => s + (x.bill.total || 0), 0);
  const revLast7 = rev(last7);
  const revPrev7 = rev(prev7);

  // ── Sales velocity per product (units/day across observed window) ──────
  const firstMs = billsWithTime.reduce((min, x) => Math.min(min, x.ms), now);
  const windowDays = Math.max(1, Math.ceil((now - firstMs) / DAY_MS));

  const soldQty = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const { bill } of billsWithTime) {
    for (const item of bill.items || []) {
      const key = item.productId || item.name;
      const cur0 = soldQty.get(key) || { name: item.name, qty: 0, revenue: 0 };
      cur0.qty += item.quantity;
      cur0.revenue += item.total;
      soldQty.set(key, cur0);
    }
  }

  // ── Restock predictions ────────────────────────────────────────────────
  const restock: RestockAlert[] = products
    .map((p) => {
      const sold = soldQty.get(p.id) || soldQty.get(p.name);
      const dailyVelocity = sold ? sold.qty / windowDays : 0;
      const daysLeft = dailyVelocity > 0 ? p.stock / dailyVelocity : null;
      let urgency: RestockAlert['urgency'] = 'ok';
      if (p.stock <= 0) urgency = 'critical';
      else if (daysLeft !== null && daysLeft <= 3) urgency = 'critical';
      else if (daysLeft !== null && daysLeft <= 7) urgency = 'soon';
      else if (p.stock <= p.lowStockAlert) urgency = 'soon';
      return {
        productId: p.id,
        name: p.name,
        stock: p.stock,
        unit: p.unit,
        dailyVelocity,
        daysLeft,
        urgency,
      };
    })
    .filter((r) => r.urgency !== 'ok')
    .sort((a, b) => {
      const rank = { critical: 0, soon: 1, ok: 2 };
      if (rank[a.urgency] !== rank[b.urgency]) return rank[a.urgency] - rank[b.urgency];
      return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
    });

  // ── Natural-language insights ───────────────────────────────────────────
  const insights: Insight[] = [];

  if (revPrev7 > 0) {
    const change = ((revLast7 - revPrev7) / revPrev7) * 100;
    if (Math.abs(change) >= 1) {
      insights.push({
        id: 'wow',
        tone: change >= 0 ? 'positive' : 'warning',
        text:
          change >= 0
            ? `Revenue is up ${change.toFixed(0)}% this week (${cur(revLast7)} vs ${cur(revPrev7)} last week). Keep the momentum going.`
            : `Revenue is down ${Math.abs(change).toFixed(0)}% this week (${cur(revLast7)} vs ${cur(revPrev7)} last week). Worth a closer look.`,
      });
    }
  } else if (revLast7 > 0) {
    insights.push({
      id: 'wow',
      tone: 'neutral',
      text: `You've made ${cur(revLast7)} across ${last7.length} bill(s) in the last 7 days.`,
    });
  }

  // Best seller
  const ranked = Array.from(soldQty.values()).sort((a, b) => b.revenue - a.revenue);
  if (ranked.length > 0) {
    const top = ranked[0];
    insights.push({
      id: 'top',
      tone: 'positive',
      text: `Your best seller is "${top.name}" — ${top.qty} sold for ${cur(top.revenue)} in revenue.`,
    });
  }

  // Best day of week
  if (billsWithTime.length >= 3) {
    const byDow = new Array(7).fill(0);
    billsWithTime.forEach((x) => { byDow[new Date(x.ms).getDay()] += x.bill.total || 0; });
    const bestDow = byDow.indexOf(Math.max(...byDow));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (byDow[bestDow] > 0) {
      insights.push({
        id: 'dow',
        tone: 'neutral',
        text: `${dayNames[bestDow]} is your strongest day so far — consider staffing or promotions around it.`,
      });
    }
  }

  // Average basket
  if (billsWithTime.length > 0) {
    const totalRev = billsWithTime.reduce((s, x) => s + (x.bill.total || 0), 0);
    const avg = totalRev / billsWithTime.length;
    insights.push({
      id: 'basket',
      tone: 'neutral',
      text: `Average bill value is ${cur(avg)} across ${billsWithTime.length} bills. Bundling or upsells could lift this.`,
    });
  }

  // Restock summary insight
  const critical = restock.filter((r) => r.urgency === 'critical');
  if (critical.length > 0) {
    insights.push({
      id: 'restock',
      tone: 'warning',
      text: `${critical.length} product(s) need restocking urgently — ${critical
        .slice(0, 3)
        .map((r) => r.name)
        .join(', ')}${critical.length > 3 ? '…' : ''}.`,
    });
  }

  // Idle customers / catalogue note
  const neverSold = products.filter((p) => !soldQty.get(p.id) && !soldQty.get(p.name));
  if (neverSold.length > 0 && products.length > 0) {
    insights.push({
      id: 'unsold',
      tone: 'neutral',
      text: `${neverSold.length} of your ${products.length} products haven't sold yet. A targeted promo might help move them.`,
    });
  }

  if (customers.length > 0) {
    const topCustomer = [...customers].sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0))[0];
    if (topCustomer && (topCustomer.totalSpend || 0) > 0) {
      insights.push({
        id: 'customer',
        tone: 'positive',
        text: `${topCustomer.name} is your top customer with ${cur(topCustomer.totalSpend)} in lifetime spend.`,
      });
    }
  }

  return {
    insights,
    restock,
    hasData: billsWithTime.length > 0 || products.length > 0,
  };
}
