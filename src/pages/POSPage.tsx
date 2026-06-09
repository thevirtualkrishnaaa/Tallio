import React, { useMemo, useState } from 'react';
import { addDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Trash2, Printer, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrgCollection } from '../lib/useOrgCollection';
import { db } from '../lib/firebase';
import { orgCol, orgDoc } from '../lib/orgData';
import { isAtLimit } from '../lib/plans';
import type { Product, Customer, BillItem, Bill } from '../types';

interface CartLine {
  productId: string;
  qty: number;
}

const POSPage: React.FC = () => {
  const { org, user, plan } = useAuth();
  const { data: products } = useOrgCollection<Product>('products');
  const { data: customers } = useOrgCollection<Customer>('customers');
  const { data: bills } = useOrgCollection<Bill>('bills');

  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(org?.defaultTaxRate ?? 0);
  const [customerId, setCustomerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Count bills created in the current calendar month
  const billsThisMonth = useMemo(() => {
    const now = new Date();
    return bills.filter((b) => {
      const ts: any = b.createdAt;
      const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null;
      if (ms == null) return false;
      const d = new Date(ms);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [bills]);

  const atSalesLimit = isAtLimit(plan, 'salesPerMonth', billsThisMonth);

  if (!org || !user) return null;
  const currency = org.currency.symbol;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 1800);
  };

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.categoryName).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(
    () => (activeCategory === 'All' ? products : products.filter((p) => p.categoryName === activeCategory)),
    [products, activeCategory]
  );

  const addToCart = (p: Product) => {
    if (p.stock <= 0) { showToast('Out of stock'); return; }
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        if (existing.qty >= p.stock) { showToast('Max stock reached'); return prev; }
        return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { productId: p.id, qty: 1 }];
    });
    showToast(`+ ${p.name}`);
  };

  const changeQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  };

  const cartLines = useMemo(
    () =>
      cart
        .map((l) => {
          const p = products.find((x) => x.id === l.productId);
          if (!p) return null;
          return { product: p, qty: l.qty, lineTotal: p.price * l.qty };
        })
        .filter(Boolean) as { product: Product; qty: number; lineTotal: number }[],
    [cart, products]
  );

  const subTotal = cartLines.reduce((s, l) => s + l.lineTotal, 0);
  const discountAmount = (subTotal * discountPercent) / 100;
  const taxable = subTotal - discountAmount;
  const taxAmount = (taxable * taxPercent) / 100;
  const total = taxable + taxAmount;

  const clearCart = () => {
    setCart([]);
    setDiscountPercent(0);
    setCustomerId('');
  };

  const checkout = async (markPaid: boolean) => {
    if (cartLines.length === 0) { showToast('Cart is empty'); return; }
    if (atSalesLimit) { showToast('Monthly bill limit reached — upgrade your plan'); return; }
    setBusy(true);
    try {
      const items: BillItem[] = cartLines.map((l) => ({
        productId: l.product.id,
        name: l.product.name,
        quantity: l.qty,
        unitPrice: l.product.price,
        unitCost: l.product.cost || 0,
        total: l.lineTotal,
      }));

      const customer = customers.find((c) => c.id === customerId);

      // Decrement stock atomically for each product
      for (const line of cartLines) {
        const ref = orgDoc(org.id, 'products', line.product.id);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) return;
          const currentStock = snap.data().stock || 0;
          tx.update(ref, { stock: Math.max(0, currentStock - line.qty), updatedAt: serverTimestamp() });
        });
      }

      await addDoc(orgCol(org.id, 'bills'), {
        ref: `#${Date.now().toString().slice(-6)}`,
        customerId: customer?.id || null,
        customerName: customer?.name || 'Walk-in customer',
        items,
        subTotal,
        discountPercent,
        discountAmount,
        taxPercent,
        taxAmount,
        total,
        paidAmount: markPaid ? total : 0,
        status: markPaid ? 'Paid' : 'Pending',
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });

      // Update customer's totalSpend / balance
      if (customer) {
        await runTransaction(db, async (tx) => {
          const ref = orgDoc(org.id, 'customers', customer.id);
          const snap = await tx.get(ref);
          if (!snap.exists()) return;
          const data = snap.data();
          tx.update(ref, {
            totalSpend: (data.totalSpend || 0) + total,
            balance: (data.balance || 0) + (markPaid ? 0 : total),
          });
        });
      }

      showToast('Bill completed ✓');
      clearCart();
    } catch (e: any) {
      console.error(e);
      showToast('Checkout failed: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {toastMsg}
        </div>
      )}

      <h2 className="text-2xl font-semibold text-gray-900 mb-1">New bill</h2>
      <p className="text-sm text-gray-500 mb-6">Tap a product to add it to the current bill.</p>

      {atSalesLimit && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-4 mb-4 flex items-center justify-between gap-3">
          <span>
            You've hit your <strong>{plan.name}</strong> plan limit of {plan.limits.salesPerMonth} bills this month.
          </span>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('tallio:nav', { detail: 'billing' }))}
            className="bg-amber-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-amber-700 whitespace-nowrap">
            Upgrade plan
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  activeCategory === c ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {products.length === 0 ? (
            <div className="bg-white border rounded-xl p-10 text-center text-sm text-gray-400">
              No products yet — add some in the Products tab to start billing.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredProducts.map((p) => {
                const oos = p.stock <= 0;
                return (
                  <button
                    key={p.id}
                    disabled={oos}
                    onClick={() => addToCart(p)}
                    className={`border rounded-xl p-3 text-center transition-colors bg-white ${
                      oos ? 'opacity-40 cursor-not-allowed' : 'hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-9 h-9 mx-auto mb-2 rounded-lg bg-gray-100 flex items-center justify-center text-sm">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-xs font-medium text-gray-900 truncate">{p.name}</div>
                    <div className="text-xs text-gray-500">{currency}{Number(p.price).toFixed(2)}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-xl flex flex-col overflow-hidden h-fit sticky top-6">
          <div className="px-4 py-3 border-b flex justify-between items-center">
            <span className="text-sm font-medium text-gray-900">Current bill</span>
          </div>

          <div className="px-4 py-2 border-b">
            <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Walk-in customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {cartLines.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-10">Cart is empty</div>
            ) : (
              cartLines.map((l) => (
                <div key={l.product.id} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50">
                  <div className="flex-1 truncate">{l.product.name}</div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => changeQty(l.product.id, -1)} className="w-5 h-5 rounded-full border text-xs flex items-center justify-center hover:bg-gray-100">−</button>
                    <span className="w-5 text-center text-xs font-medium">{l.qty}</span>
                    <button onClick={() => changeQty(l.product.id, 1)} className="w-5 h-5 rounded-full border text-xs flex items-center justify-center hover:bg-gray-100">+</button>
                  </div>
                  <div className="w-16 text-right text-xs font-medium">{currency}{l.lineTotal.toFixed(2)}</div>
                </div>
              ))
            )}
          </div>

          <div className="border-t px-4 py-3 space-y-2">
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-500 flex-1">Discount %</span>
              <input type="number" min={0} max={100} className="input w-24 text-xs" value={discountPercent} onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-500 flex-1">Tax %</span>
              <input type="number" min={0} max={100} className="input w-24 text-xs" value={taxPercent} onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="flex justify-between text-xs text-gray-500"><span>Subtotal</span><span>{currency}{subTotal.toFixed(2)}</span></div>
            {discountPercent > 0 && (
              <div className="flex justify-between text-xs text-green-600"><span>Discount</span><span>− {currency}{discountAmount.toFixed(2)}</span></div>
            )}
            <div className="flex justify-between text-xs text-gray-500"><span>Tax</span><span>{currency}{taxAmount.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm font-semibold text-gray-900 border-t pt-2"><span>Total</span><span>{currency}{total.toFixed(2)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3 border-t">
            <button onClick={clearCart} className="border rounded-lg py-2 text-xs flex items-center justify-center gap-1.5 hover:bg-gray-50"><Trash2 size={14} /> Clear</button>
            <button onClick={() => window.print()} className="border rounded-lg py-2 text-xs flex items-center justify-center gap-1.5 hover:bg-gray-50"><Printer size={14} /> Print</button>
            <button disabled={busy} onClick={() => checkout(false)} className="col-span-2 border rounded-lg py-2 text-xs hover:bg-gray-50 disabled:opacity-50">Save as pending</button>
            <button disabled={busy} onClick={() => checkout(true)} className="col-span-2 bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-gray-800 disabled:opacity-50">
              <Check size={15} /> Complete & mark paid
            </button>
          </div>
        </div>
      </div>
      <style>{`.input { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.4rem 0.6rem; font-size: 0.8rem; } .input:focus { outline:none; box-shadow: 0 0 0 2px #11182733; }`}</style>
    </div>
  );
};

export default POSPage;
