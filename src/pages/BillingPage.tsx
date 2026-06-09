import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PLAN_ORDER, PLANS } from '../lib/plans';
import type { PlanId } from '../lib/plans';

const BillingPage: React.FC = () => {
  const { plan, changePlan, isDemo } = useAuth();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [done, setDone] = useState<PlanId | null>(null);

  const select = async (planId: PlanId) => {
    if (planId === plan.id || isDemo) return;
    setBusy(planId);
    setDone(null);
    try {
      await changePlan(planId);
      setDone(planId);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Billing & Plan</h2>
        <p className="text-sm text-gray-500">
          You're currently on the <strong>{plan.name}</strong> plan.
        </p>
      </div>

      {isDemo && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-4 mb-6">
          You're in demo mode with full Scale access. Create a free account to choose your own plan.
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-5">
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const current = p.id === plan.id;
          return (
            <div
              key={p.id}
              className={`rounded-2xl border p-6 flex flex-col ${
                p.highlight ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200'
              }`}
            >
              {p.highlight && (
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-900 mb-1">
                  Most popular
                </div>
              )}
              <div className="text-lg font-semibold text-gray-900">{p.name}</div>
              <div className="mt-1 mb-4">
                <span className="text-3xl font-bold text-gray-900">{p.priceLabel}</span>
                <span className="text-sm text-gray-400">/mo</span>
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="text-sm text-gray-600 flex items-center gap-2">
                    <Check size={15} className="text-green-600" /> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => select(p.id)}
                disabled={current || isDemo || busy !== null}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  current
                    ? 'bg-gray-100 text-gray-500 cursor-default'
                    : 'bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50'
                }`}
              >
                {current
                  ? 'Current plan'
                  : busy === p.id
                  ? 'Switching…'
                  : done === p.id
                  ? 'Switched ✓'
                  : `Switch to ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-6">
        💳 Payments aren't wired up yet — switching plans is instant for now. Stripe checkout is coming soon.
      </p>
    </div>
  );
};

export default BillingPage;
