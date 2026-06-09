// Seed a demo org with realistic UK retail sample data
import { writeBatch, doc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

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

  // ── Phase 2: catalogue, customers, sales ────────────────────────────────
  const batch = writeBatch(db);

  // Products
  const products = [
    { name: 'Espresso', price: 2.50, cost: 0.40, stock: 999, unit: 'cup', sku: 'ESP001' },
    { name: 'Flat White', price: 3.20, cost: 0.60, stock: 999, unit: 'cup', sku: 'FLW001' },
    { name: 'Cappuccino', price: 3.00, cost: 0.55, stock: 999, unit: 'cup', sku: 'CAP001' },
    { name: 'Latte', price: 3.50, cost: 0.65, stock: 999, unit: 'cup', sku: 'LAT001' },
    { name: 'Croissant', price: 2.80, cost: 0.90, stock: 48, unit: 'each', sku: 'CRO001' },
    { name: 'Blueberry Muffin', price: 2.50, cost: 0.75, stock: 36, unit: 'each', sku: 'MUF001' },
    { name: 'Club Sandwich', price: 6.50, cost: 2.20, stock: 20, unit: 'each', sku: 'SAN001' },
    { name: 'Green Tea', price: 2.20, cost: 0.30, stock: 999, unit: 'cup', sku: 'TEA001' },
  ];

  const productIds: string[] = [];
  for (const p of products) {
    const ref = doc(collection(db, 'orgs', orgId, 'products'));
    productIds.push(ref.id);
    batch.set(ref, {
      ...p,
      categoryId: '',
      categoryName: 'General',
      lowStockAlert: 5,
      attributes: {},
      createdAt: serverTimestamp(),
    });
  }

  // Customers
  const customers = [
    { name: 'Alice Johnson', email: 'alice@example.com', phone: '07700 900123', totalSpend: 142.50, balance: 0 },
    { name: 'Ben Carter',    email: 'ben@example.com',   phone: '07700 900456', totalSpend: 87.20,  balance: 0 },
    { name: 'Clara Singh',   email: 'clara@example.com', phone: '07700 900789', totalSpend: 220.00, balance: 0 },
    { name: 'David Park',    email: 'david@example.com', phone: '07700 900321', totalSpend: 56.80,  balance: 0 },
  ];

  for (const c of customers) {
    const ref = doc(collection(db, 'orgs', orgId, 'customers'));
    batch.set(ref, { ...c, createdAt: serverTimestamp() });
  }

  // Sales — spread over the last 7 days
  const saleData = [
    { items: [{ name: 'Flat White', qty: 2, price: 3.20 }, { name: 'Croissant', qty: 2, price: 2.80 }], daysAgo: 0 },
    { items: [{ name: 'Latte', qty: 1, price: 3.50 }, { name: 'Blueberry Muffin', qty: 1, price: 2.50 }], daysAgo: 0 },
    { items: [{ name: 'Club Sandwich', qty: 2, price: 6.50 }, { name: 'Espresso', qty: 2, price: 2.50 }], daysAgo: 1 },
    { items: [{ name: 'Cappuccino', qty: 3, price: 3.00 }], daysAgo: 1 },
    { items: [{ name: 'Green Tea', qty: 2, price: 2.20 }, { name: 'Croissant', qty: 1, price: 2.80 }], daysAgo: 2 },
    { items: [{ name: 'Flat White', qty: 4, price: 3.20 }], daysAgo: 2 },
    { items: [{ name: 'Latte', qty: 2, price: 3.50 }, { name: 'Club Sandwich', qty: 1, price: 6.50 }], daysAgo: 3 },
    { items: [{ name: 'Espresso', qty: 5, price: 2.50 }], daysAgo: 4 },
    { items: [{ name: 'Blueberry Muffin', qty: 3, price: 2.50 }, { name: 'Cappuccino', qty: 2, price: 3.00 }], daysAgo: 5 },
    { items: [{ name: 'Club Sandwich', qty: 3, price: 6.50 }, { name: 'Green Tea', qty: 3, price: 2.20 }], daysAgo: 6 },
  ];

  const demoCustomerNames = ['Alice Johnson', 'Ben Carter', 'Clara Singh', 'David Park', 'Walk-in customer'];

  for (let i = 0; i < saleData.length; i++) {
    const sale = saleData[i];
    const ref = doc(collection(db, 'orgs', orgId, 'bills'));
    const billItems = sale.items.map(it => ({
      productId: '',
      name: it.name,
      quantity: it.qty,
      unitPrice: it.price,
      unitCost: parseFloat((it.price * 0.35).toFixed(2)),
      total: it.qty * it.price,
    }));
    const subTotal = billItems.reduce((s, it) => s + it.total, 0);
    const taxAmount = parseFloat((subTotal * 0.2).toFixed(2));
    const date = new Date();
    date.setDate(date.getDate() - sale.daysAgo);
    batch.set(ref, {
      ref: `#${String(i + 1).padStart(4, '0')}`,
      customerId: null,
      customerName: demoCustomerNames[i % demoCustomerNames.length],
      items: billItems,
      subTotal,
      discountPercent: 0,
      discountAmount: 0,
      taxPercent: 20,
      taxAmount,
      total: parseFloat((subTotal + taxAmount).toFixed(2)),
      paidAmount: parseFloat((subTotal + taxAmount).toFixed(2)),
      status: 'Paid',
      createdAt: Timestamp.fromDate(date),
      createdBy: userId,
    });
  }

  await batch.commit();
}
