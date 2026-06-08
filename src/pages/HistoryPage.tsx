import React from 'react';
import { orderBy } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useOrgCollection } from '../lib/useOrgCollection';
import type { Bill } from '../types';

const HistoryPage: React.FC = () => {
  const { org } = useAuth();
  const { data: bills, loading } = useOrgCollection<Bill>('bills', [orderBy('createdAt', 'desc')]);

  if (!org) return null;
  const currency = org.currency.symbol;

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-1">Bill history</h2>
      <p className="text-sm text-gray-500 mb-6">All bills created in your workspace.</p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : bills.length === 0 ? (
        <div className="bg-white border rounded-xl p-10 text-center text-sm text-gray-400">No bills yet.</div>
      ) : (
        <div className="space-y-2">
          {bills.map((b) => (
            <div key={b.id} className="bg-white border rounded-xl p-4 flex justify-between items-start">
              <div>
                <div className="text-sm font-medium text-gray-900">Bill {b.ref} · {b.customerName || 'Walk-in customer'}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {b.createdAt?.toDate ? b.createdAt.toDate().toLocaleString() : ''}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {b.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}
                </div>
              </div>
              <div className="text-right">
                <div className="text-base font-semibold text-gray-900">{currency}{Number(b.total).toFixed(2)}</div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  b.status === 'Paid' ? 'bg-green-100 text-green-700' : b.status === 'Partially Paid' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {b.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
