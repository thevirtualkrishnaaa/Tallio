import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const PLANS = [
  { name: 'Starter', price: '£10', period: '/mo', features: ['50 products', '100 sales / month', '1 user'] },
  { name: 'Growth', price: '£49', period: '/mo', features: ['500 products', 'Unlimited sales', '3 users'], highlight: true },
  { name: 'Scale', price: '£149', period: '/mo', features: ['Unlimited everything', '10 users', 'Priority support'] },
];

const DemoExpiredPage: React.FC = () => {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);

  const createAccount = async () => {
    setBusy(true);
    await logout(); // returns user to the auth page to register a real account
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-md p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <Lock className="text-amber-600" size={22} />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Your demo has ended</h1>
        <p className="text-sm text-gray-500 mb-8">
          Thanks for trying Tallio! Create a free account to keep going and pick a plan that fits your business.
        </p>

        <div className="grid sm:grid-cols-3 gap-4 mb-8 text-left">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-xl border p-5 ${
                p.highlight ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200'
              }`}
            >
              {p.highlight && (
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-900 mb-1">
                  Most popular
                </div>
              )}
              <div className="text-base font-semibold text-gray-900">{p.name}</div>
              <div className="mt-1 mb-3">
                <span className="text-2xl font-bold text-gray-900">{p.price}</span>
                <span className="text-sm text-gray-400">{p.period}</span>
              </div>
              <ul className="space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="text-xs text-gray-600 flex items-center gap-1.5">
                    <span className="text-green-600">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <button
          onClick={createAccount}
          disabled={busy}
          className="bg-gray-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? 'Please wait…' : 'Create my free account'}
        </button>
      </div>
    </div>
  );
};

export default DemoExpiredPage;
