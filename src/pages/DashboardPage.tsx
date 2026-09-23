import React, { useMemo } from 'react';
import { orderBy } from 'firebase/firestore';
import { TrendingUp, TrendingDown, AlertCircle, DollarSign, Receipt } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrgCollection } from '../lib/useOrgCollection';
import type { Bill, Product, Expense } from '../types';

const DashboardPage: React.FC = () => {
  const { org } = useAuth();
  const { data: bills } = useOrgCollection<Bill>('bills', [orderBy('createdAt', 'desc')]);
  const { data: products } = useOrgCollection<Product>('products');
  const { data: expenses } = useOrgCollection<Expense>('expenses', [orderBy('createdAt', 'desc')]);

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

  const grossMarginPct = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;
  const netMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= p.lowStockAlert);
  const outOfStock = products.filter((p) => p.stock <= 0);

  // Product-wise performance: revenue & qty sold
  const productPerf = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    bills.forEach((b) =>
      (b.items || []).forEach((i) => {
        const cur = map.get(i.productId) || { name: i.name, qty: 0, revenue: 0 };
        cur.qty += i.quantity;
        cur.revenue += i.total;
        map.set(i.productId, cur);
      })
    );
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [bills]);

  // Guard after the hook, never before it — see POSPage for why.
  if (!org) return null;
  const currency = org.currency.symbol;

  const topProducts = productPerf.slice(0, 5);
  const slowMoving = products
    .filter((p) => !productPerf.find((pp) => pp.name === p.name))
    .slice(0, 5);

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-1">Dashboard</h2>
      <p className="text-sm text-gray-500 mb-6">Key metrics for {org.name}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi icon={TrendingUp} color="text-blue-500" label="Total revenue" value={`${currency}${totalRevenue.toFixed(2)}`} hint={`${bills.length} bills created`} />
        <Kpi icon={DollarSign} color="text-emerald-500" label="Gross profit" value={`${currency}${totalGrossProfit.toFixed(2)}`} hint={`${grossMarginPct.toFixed(1)}% gross margin`} />
        <Kpi icon={TrendingDown} color="text-rose-500" label="Total expenses" value={`${currency}${totalExpenses.toFixed(2)}`} hint={`${expenses.length} expense entries`} />
        <Kpi
          icon={Receipt}
          color={netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}
          label="Net profit"
          value={`${netProfit < 0 ? '-' : ''}${currency}${Math.abs(netProfit).toFixed(2)}`}
          hint={`${netMarginPct.toFixed(1)}% net margin`}
        />
      </div>

      {(lowStock.length > 0 || outOfStock.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex gap-3">
          <AlertCircle className="text-amber-600 shrink-0" size={20} />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Stock alerts</p>
            <p className="mt-0.5">
              {outOfStock.length > 0 && <>{outOfStock.length} product(s) out of stock. </>}
              {lowStock.length > 0 && <>{lowStock.length} product(s) running low. </>}
              Consider restocking soon.
            </p>
          </div>
        </div>
      )}

      {/* P&L Financial Waterfall Card */}
      <div className="bg-white border rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Profit & Loss (P&L) Summary</h3>
          <span className="text-xs text-gray-400 font-medium">All-time workspace financials</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-center divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          <div className="pt-2 sm:pt-0 sm:px-2">
            <div className="text-xs text-gray-400">Total Revenue</div>
            <div className="text-base font-bold text-gray-900 mt-0.5">{currency}{totalRevenue.toFixed(2)}</div>
            <div className="text-[11px] text-gray-400">100% of sales</div>
          </div>
          <div className="pt-2 sm:pt-0 sm:px-2">
            <div className="text-xs text-gray-400">Cost of Goods (COGS)</div>
            <div className="text-base font-semibold text-gray-700 mt-0.5">− {currency}{totalCogs.toFixed(2)}</div>
            <div className="text-[11px] text-gray-400">{totalRevenue > 0 ? ((totalCogs / totalRevenue) * 100).toFixed(1) : '0'}% of sales</div>
          </div>
          <div className="pt-2 sm:pt-0 sm:px-2">
            <div className="text-xs text-gray-400">Gross Margin</div>
            <div className="text-base font-bold text-blue-600 mt-0.5">{currency}{totalGrossProfit.toFixed(2)}</div>
            <div className="text-[11px] text-blue-500 font-medium">{grossMarginPct.toFixed(1)}% margin</div>
          </div>
          <div className="pt-2 sm:pt-0 sm:px-2">
            <div className="text-xs text-gray-400">Operating Expenses</div>
            <div className="text-base font-semibold text-rose-600 mt-0.5">− {currency}{totalExpenses.toFixed(2)}</div>
            <div className="text-[11px] text-gray-400">{totalRevenue > 0 ? ((totalExpenses / totalRevenue) * 100).toFixed(1) : '0'}% overhead</div>
          </div>
          <div className="pt-2 sm:pt-0 sm:px-2">
            <div className="text-xs text-gray-400 font-medium">Net Profit / Income</div>
            <div className={`text-base font-bold mt-0.5 ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {netProfit < 0 ? '-' : ''}{currency}{Math.abs(netProfit).toFixed(2)}
            </div>
            <div className={`text-[11px] font-semibold ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {netMarginPct.toFixed(1)}% net
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Top performing products">
          {topProducts.length === 0 ? (
            <Empty text="No sales yet — complete a bill to see performance data." />
          ) : (
            <ul className="divide-y">
              {topProducts.map((p) => (
                <li key={p.name} className="flex justify-between py-2 text-sm">
                  <span className="text-gray-700">{p.name} <span className="text-gray-400">· {p.qty} sold</span></span>
                  <span className="font-medium text-gray-900">{currency}{p.revenue.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Slow-moving / unsold products">
          {slowMoving.length === 0 ? (
            <Empty text="Everything in your catalogue has sold at least once. 🎉" />
          ) : (
            <ul className="divide-y">
              {slowMoving.map((p) => (
                <li key={p.id} className="flex justify-between py-2 text-sm">
                  <span className="text-gray-700">{p.name}</span>
                  <span className="text-gray-400">{p.stock} {p.unit} in stock</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-5">
        <Panel title="Recent bills">
          {bills.length === 0 ? (
            <Empty text="No bills yet." />
          ) : (
            <ul className="divide-y">
              {bills.slice(0, 6).map((b) => (
                <li key={b.id} className="flex justify-between py-2 text-sm">
                  <span className="text-gray-700">{b.ref} · {b.customerName || 'Walk-in customer'}</span>
                  <span className="font-medium text-gray-900">{currency}{Number(b.total).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
};

const Kpi: React.FC<{ icon: React.ElementType; color: string; label: string; value: string; hint: string }> = ({ icon: Icon, color, label, value, hint }) => (
  <div className="bg-white border rounded-xl p-4 flex items-center gap-3">
    <Icon className={color} size={26} />
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-400">{hint}</div>
    </div>
  </div>
);

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white border rounded-xl p-5">
    <h3 className="text-sm font-medium text-gray-900 mb-2">{title}</h3>
    {children}
  </div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-sm text-gray-400 py-6 text-center">{text}</p>
);

export default DashboardPage;
