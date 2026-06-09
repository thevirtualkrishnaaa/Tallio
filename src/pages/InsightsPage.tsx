import React, { useMemo } from 'react';
import { orderBy } from 'firebase/firestore';
import { Sparkles, TrendingUp, AlertTriangle, Lightbulb, PackageX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrgCollection } from '../lib/useOrgCollection';
import { buildInsights } from '../lib/insights';
import type { Bill, Product, Customer } from '../types';

const toneStyles = {
  positive: { wrap: 'bg-green-50 border-green-200', icon: 'text-green-600', Icon: TrendingUp },
  warning: { wrap: 'bg-amber-50 border-amber-200', icon: 'text-amber-600', Icon: AlertTriangle },
  neutral: { wrap: 'bg-blue-50 border-blue-200', icon: 'text-blue-600', Icon: Lightbulb },
} as const;

const urgencyStyles = {
  critical: { badge: 'bg-red-100 text-red-700', label: 'Restock now' },
  soon: { badge: 'bg-amber-100 text-amber-700', label: 'Restock soon' },
  ok: { badge: 'bg-green-100 text-green-700', label: 'OK' },
} as const;

const InsightsPage: React.FC = () => {
  const { org } = useAuth();
  const { data: bills, loading: lb } = useOrgCollection<Bill>('bills', [orderBy('createdAt', 'desc')]);
  const { data: products, loading: lp } = useOrgCollection<Product>('products');
  const { data: customers } = useOrgCollection<Customer>('customers');

  const report = useMemo(
    () => buildInsights(bills, products, customers, org?.currency.symbol || '£'),
    [bills, products, customers, org?.currency.symbol]
  );

  if (!org) return null;
  const loading = lb || lp;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="text-purple-500" size={22} />
        <h2 className="text-2xl font-semibold text-gray-900">Tallio Insights</h2>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Automatic analysis of your sales, products, and customers — refreshed live.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Analysing your data…</p>
      ) : !report.hasData ? (
        <div className="bg-white border rounded-xl p-10 text-center text-sm text-gray-400">
          Add some products and complete a few bills — insights will appear here automatically.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Insight cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.insights.map((ins) => {
              const s = toneStyles[ins.tone];
              const Icon = s.Icon;
              return (
                <div key={ins.id} className={`border rounded-xl p-4 flex gap-3 ${s.wrap}`}>
                  <Icon className={`${s.icon} shrink-0 mt-0.5`} size={18} />
                  <p className="text-sm text-gray-800">{ins.text}</p>
                </div>
              );
            })}
            {report.insights.length === 0 && (
              <p className="text-sm text-gray-400">Not enough sales yet to surface trends.</p>
            )}
          </div>

          {/* Restock predictions */}
          <div className="bg-white border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <PackageX className="text-gray-500" size={18} />
              <h3 className="text-sm font-medium text-gray-900">Smart restock predictions</h3>
            </div>
            {report.restock.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                All stock levels look healthy. 🎉
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-gray-400 border-b">
                    <th className="text-left font-medium py-2">Product</th>
                    <th className="text-right font-medium py-2">In stock</th>
                    <th className="text-right font-medium py-2">Selling / day</th>
                    <th className="text-right font-medium py-2">Runs out in</th>
                    <th className="text-right font-medium py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.restock.map((r) => {
                    const u = urgencyStyles[r.urgency];
                    return (
                      <tr key={r.productId} className="border-b last:border-0">
                        <td className="py-2 font-medium text-gray-900">{r.name}</td>
                        <td className="py-2 text-right">{r.stock} {r.unit}</td>
                        <td className="py-2 text-right text-gray-500">
                          {r.dailyVelocity > 0 ? r.dailyVelocity.toFixed(1) : '—'}
                        </td>
                        <td className="py-2 text-right">
                          {r.stock <= 0
                            ? 'Out now'
                            : r.daysLeft !== null
                            ? `${Math.ceil(r.daysLeft)} day(s)`
                            : '—'}
                        </td>
                        <td className="py-2 text-right">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${u.badge}`}>{u.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-xs text-gray-400">
            ✨ These insights update automatically as you make sales. Conversational "Ask Tallio" AI is coming next.
          </p>
        </div>
      )}
    </div>
  );
};

export default InsightsPage;
