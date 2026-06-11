// Seed a demo org with ~3 months of realistic UK coffee-shop data.
//
// The generated history contains deliberate patterns for the AI assistant
// to discover:
//   - Flat White is steadily RISING in popularity month over month
//   - Croissant is steadily DECLINING
//   - Iced Latte only started selling ~3 weeks ago (new summer item) and is booming
//   - Saturdays are the strongest day; Mondays are weak
//   - Club Sandwich has the best margin but stock is nearly out (restock urgency)
//   - Earl Grey Tea has never sold once (dead stock)
//   - Clara Singh is a loyal weekly big spender; Ben Carter has unpaid bills
import { writeBatch, doc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// Deterministic pseudo-random so every demo looks sensible (no flaky seeds)
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

interface SeedProduct {
  name: string;
  price: number;
  cost: number;
  stock: number;
  unit: string;
  sku: string;
  lowStockAlert: number;
  // popularity weight at day d (0 = today, 90 = oldest)
  weight: (daysAgo: number) => number;
}

const PRODUCTS: SeedProduct[] = [
  { name: 'Espresso', price: 2.5, cost: 0.4, stock: 999, unit: 'cup', sku: 'ESP001', lowStockAlert: 5,
    weight: () => 3 },
  { name: 'Flat White', price: 3.2, cost: 0.6, stock: 999, unit: 'cup', sku: 'FLW001', lowStockAlert: 5,
    weight: (d) => 1.5 + (90 - d) * 0.045 }, // rising: ~1.5 three months ago → ~5.5 now
  { name: 'Cappuccino', price: 3.0, cost: 0.55, stock: 999, unit: 'cup', sku: 'CAP001', lowStockAlert: 5,
    weight: () => 2.5 },
  { name: 'Latte', price: 3.5, cost: 0.65, stock: 999, unit: 'cup', sku: 'LAT001', lowStockAlert: 5,
    weight: () => 2.2 },
  { name: 'Iced Latte', price: 3.8, cost: 0.7, stock: 999, unit: 'cup', sku: 'ICE001', lowStockAlert: 5,
    weight: (d) => (d <= 21 ? 4.5 : 0) }, // new summer item, only last 3 weeks
  { name: 'Croissant', price: 2.8, cost: 0.9, stock: 42, unit: 'each', sku: 'CRO001', lowStockAlert: 10,
    weight: (d) => 0.8 + d * 0.035 }, // declining: ~4 three months ago → ~0.8 now
  { name: 'Blueberry Muffin', price: 2.5, cost: 0.75, stock: 30, unit: 'each', sku: 'MUF001', lowStockAlert: 8,
    weight: () => 1.8 },
  { name: 'Club Sandwich', price: 6.5, cost: 2.2, stock: 4, unit: 'each', sku: 'SAN001', lowStockAlert: 6,
    weight: () => 2.0 }, // best £ margin, nearly out of stock
  { name: 'Sausage Roll', price: 3.4, cost: 1.1, stock: 25, unit: 'each', sku: 'SR001', lowStockAlert: 8,
    weight: () => 1.5 },
  { name: 'Green Tea', price: 2.2, cost: 0.3, stock: 999, unit: 'cup', sku: 'TEA001', lowStockAlert: 5,
    weight: () => 1.0 },
  { name: 'Earl Grey Tea', price: 2.4, cost: 0.35, stock: 80, unit: 'cup', sku: 'TEA002', lowStockAlert: 5,
    weight: () => 0 }, // never sells — dead stock
  { name: 'Hot Chocolate', price: 3.3, cost: 0.8, stock: 999, unit: 'cup', sku: 'HOT001', lowStockAlert: 5,
    weight: (d) => 1.0 + d * 0.02 }, // slowly fading as summer arrives
];

const CUSTOMERS = [
  { name: 'Clara Singh', email: 'clara@example.com', phone: '07700 900789' },  // loyal weekly regular
  { name: 'Alice Johnson', email: 'alice@example.com', phone: '07700 900123' },
  { name: 'Ben Carter', email: 'ben@example.com', phone: '07700 900456' },     // tends to leave bills pending
  { name: 'David Park', email: 'david@example.com', phone: '07700 900321' },
  { name: 'Emma Wright', email: 'emma@example.com', phone: '07700 900654' },
];

// Day-of-week multiplier: Sat strongest, Sun decent, Mon weakest
const DOW_MULT = [1.1, 0.55, 0.8, 0.9, 1.0, 1.2, 1.7]; // Sun..Sat

export async function seedDemoOrg(orgId: string, userId: string) {
  // ── Phase 1: org + member doc ───────────────────────────────────────────
  // Must commit first so security rules (isManager) can see the member doc
  // before we write catalogue data in phase 2.
  const setup = writeBatch(db);

  setup.set(doc(db, 'orgs', orgId), {
    name: 'Demo Store',
    currency: { code: 'GBP', symbol: '£' },
    defaultTaxRate: 20,
    ownerId: userId,
    plan: 'scale', // demo unlocks all features
    isDemo: true,
    createdAt: serverTimestamp(),
  });

  setup.set(doc(db, 'orgs', orgId, 'members', userId), {
    userId,
    email: 'demo@tallio.app',
    role: 'owner',
    joinedAt: serverTimestamp(),
  });

  await setup.commit();

  // ── Phase 2: catalogue + customers + 90 days of bills ────────────────────
  const rng = makeRng(42);
  let batch = writeBatch(db);
  let ops = 0;
  const commits: Promise<void>[] = [];
  const flushIfNeeded = () => {
    if (ops >= 450) {
      commits.push(batch.commit());
      batch = writeBatch(db);
      ops = 0;
    }
  };

  // Products
  const productIdByName = new Map<string, string>();
  for (const p of PRODUCTS) {
    const ref = doc(collection(db, 'orgs', orgId, 'products'));
    productIdByName.set(p.name, ref.id);
    batch.set(ref, {
      name: p.name,
      price: p.price,
      cost: p.cost,
      stock: p.stock,
      unit: p.unit,
      sku: p.sku,
      lowStockAlert: p.lowStockAlert,
      categoryId: '',
      categoryName: 'General',
      attributes: {},
      createdAt: serverTimestamp(),
    });
    ops++;
  }

  // Customers (refs first; totals filled in after we generate bills)
  const customerRefs = CUSTOMERS.map(() => doc(collection(db, 'orgs', orgId, 'customers')));
  const customerTotals = CUSTOMERS.map(() => ({ totalSpend: 0, balance: 0 }));

  // ── Generate ~90 days of bills ───────────────────────────────────────────
  let billNo = 0;
  for (let daysAgo = 90; daysAgo >= 0; daysAgo--) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const dow = date.getDay();

    // Bills per day: base 3-6, scaled by day-of-week, slight overall growth
    const growth = 1 + (90 - daysAgo) * 0.004; // business slowly growing
    const billCount = Math.max(1, Math.round((3 + rng() * 3) * DOW_MULT[dow] * growth));

    for (let b = 0; b < billCount; b++) {
      billNo++;

      // Pick 1-3 distinct products weighted by their popularity on this day
      const weighted = PRODUCTS.map((p) => ({ p, w: p.weight(daysAgo) })).filter((x) => x.w > 0);
      const totalW = weighted.reduce((s, x) => s + x.w, 0);
      const pick = () => {
        let r = rng() * totalW;
        for (const x of weighted) { r -= x.w; if (r <= 0) return x.p; }
        return weighted[weighted.length - 1].p;
      };
      const lineCount = 1 + Math.floor(rng() * 3);
      const chosen = new Map<string, { p: SeedProduct; qty: number }>();
      for (let i = 0; i < lineCount; i++) {
        const p = pick();
        const cur = chosen.get(p.name);
        if (cur) cur.qty += 1;
        else chosen.set(p.name, { p, qty: 1 + Math.floor(rng() * 2) });
      }

      const items = Array.from(chosen.values()).map(({ p, qty }) => ({
        productId: productIdByName.get(p.name) || '',
        name: p.name,
        quantity: qty,
        unitPrice: p.price,
        unitCost: p.cost,
        total: parseFloat((p.price * qty).toFixed(2)),
      }));

      const subTotal = parseFloat(items.reduce((s, i) => s + i.total, 0).toFixed(2));
      const taxAmount = parseFloat((subTotal * 0.2).toFixed(2));
      const total = parseFloat((subTotal + taxAmount).toFixed(2));

      // Customer: Clara buys roughly weekly (and big), others occasionally, most walk-in
      let custIdx = -1;
      if (dow === 6 && rng() < 0.7) custIdx = 0;            // Clara most Saturdays
      else if (rng() < 0.25) custIdx = 1 + Math.floor(rng() * 4);

      // Ben (idx 2) leaves ~half his bills unpaid; otherwise ~5% pending
      const isPending = custIdx === 2 ? rng() < 0.5 : rng() < 0.05;

      if (custIdx >= 0) {
        customerTotals[custIdx].totalSpend += total;
        if (isPending) customerTotals[custIdx].balance += total;
      }

      // Spread bill times across opening hours 8:00-17:00
      const billDate = new Date(date);
      billDate.setHours(8 + Math.floor(rng() * 9), Math.floor(rng() * 60), 0, 0);

      const ref = doc(collection(db, 'orgs', orgId, 'bills'));
      batch.set(ref, {
        ref: `#${String(billNo).padStart(4, '0')}`,
        customerId: custIdx >= 0 ? customerRefs[custIdx].id : null,
        customerName: custIdx >= 0 ? CUSTOMERS[custIdx].name : 'Walk-in customer',
        items,
        subTotal,
        discountPercent: 0,
        discountAmount: 0,
        taxPercent: 20,
        taxAmount,
        total,
        paidAmount: isPending ? 0 : total,
        status: isPending ? 'Pending' : 'Paid',
        createdAt: Timestamp.fromDate(billDate),
        createdBy: userId,
      });
      ops++;
      flushIfNeeded();
    }
  }

  // Customers with real totals derived from the generated bills
  CUSTOMERS.forEach((c, i) => {
    batch.set(customerRefs[i], {
      ...c,
      totalSpend: parseFloat(customerTotals[i].totalSpend.toFixed(2)),
      balance: parseFloat(customerTotals[i].balance.toFixed(2)),
      createdAt: serverTimestamp(),
    });
    ops++;
  });

  commits.push(batch.commit());
  await Promise.all(commits);
}
