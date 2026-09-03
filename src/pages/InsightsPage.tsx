import React, { useMemo, useState } from 'react';
import { orderBy } from 'firebase/firestore';
import {
  Sparkles, TrendingUp, AlertTriangle, Lightbulb, PackageX,
  RefreshCw, Loader2, ArrowRight, Bot,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrgCollection } from '../lib/useOrgCollection';
import { buildInsights } from '../lib/insights';
import {
  generateBriefing, loadBriefing, saveBriefing, dataFingerprint, timeAgo,
} from '../lib/aiInsights';
import type { AiBriefing } from '../lib/aiInsights';
import type { Bill, Product, Customer } from '../types';

const toneStyles = {
  positive: { wrap: 'bg-green-50 border-green-200', icon: 'text-green-600', Icon: TrendingUp },
  warning: { wrap: 'bg-amber-50 border-amber-200', icon: 'text-amber-600', Icon: AlertTriangle },
  neutral: { wrap: 'bg-blue-50 border-blue-200', icon: 'text-blue-600', Icon: Lightbulb },
} as const;

const findingDot = {
  positive: 'bg-green-500',
  warning: 'bg-amber-500',
  neutral: 'bg-blue-500',
} as const;

// Briefing state is keyed by org so switching orgs (or into demo) shows that
// org's own cached briefing rather than the previous one.
interface AiState {
  orgId: string | null;
  briefing: AiBriefing | null;
  error: string;
}

const initAi = (orgId: string | null): AiState => ({
  orgId,
  briefing: orgId ? loadBriefing(orgId) : null,
  error: '',
});

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

  // ── Claude-written briefing ──────────────────────────────────────────────
  const orgId = org?.id ?? null;
  const [ai, setAi] = useState<AiState>(() => initAi(orgId));
  const [writing, setWriting] = useState(false);

  // Org changed — reload that org's cached briefing during render rather than
  // in an effect, so the page never flashes the previous org's briefing.
  if (ai.orgId !== orgId) setAi(initAi(orgId));

  const { briefing, error: aiError } = ai;

  const fingerprint = useMemo(
    () => dataFingerprint(bills, products, customers),
    [bills, products, customers]
  );
  const stale = !!briefing && briefing.fingerprint !== fingerprint;

  const write = async () => {
    if (!org || writing) return;
    setWriting(true);
    setAi((s) => ({ ...s, error: '' }));
    try {
      const next = await generateBriefing(org, bills, products, customers);
      saveBriefing(org.id, next);
      setAi({ orgId: org.id, briefing: next, error: '' });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Tallio AI is unavailable right now — please try again.';
      setAi((s) => ({ ...s, error: message }));
    } finally {
      setWriting(false);
    }
  };

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
          {/* AI analyst briefing — written by Claude from the live data */}
          <div className="border border-purple-200 bg-gradient-to-br from-purple-50 to-white rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <Bot className="text-purple-600 shrink-0" size={18} />
                <div>
                  <h3 className="text-sm font-medium text-gray-900">AI analyst briefing</h3>
                  <p className="text-xs text-gray-500">
                    Written by Claude, reading your live sales, stock and customers.
                  </p>
                </div>
              </div>
              <button
                onClick={write}
                disabled={writing}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {writing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                {writing ? 'Writing…' : briefing ? 'Refresh' : 'Write my briefing'}
              </button>
            </div>

            {aiError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                {aiError}
              </p>
            )}

            {writing && !briefing ? (
              <p className="text-sm text-gray-500 py-4">
                Claude is reading your books — this takes a few seconds…
              </p>
            ) : !briefing ? (
              <p className="text-sm text-gray-500 py-2">
                The cards below are computed instantly from your numbers. Ask Claude for the
                written version when you want the story behind them — what is trending, what is
                quietly slipping, and what to do about it this week.
              </p>
            ) : (
              <div className="space-y-4">
                {briefing.summary && (
                  <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                    {briefing.summary}
                  </p>
                )}

                {briefing.findings.length > 0 && (
                  <ul className="space-y-2">
                    {briefing.findings.map((f, i) => (
                      <li key={i} className="flex gap-2.5 text-sm">
                        <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${findingDot[f.tone]}`} />
                        <span className="text-gray-800">
                          <span className="font-medium text-gray-900">{f.title}</span>
                          {f.detail && <> — {f.detail}</>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {briefing.actions.length > 0 && (
                  <div className="bg-white border border-purple-100 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wide text-purple-600 font-medium mb-2">
                      What to do next
                    </p>
                    <ul className="space-y-1.5">
                      {briefing.actions.map((a, i) => (
                        <li key={i} className="flex gap-2 text-sm text-gray-800">
                          <ArrowRight className="text-purple-400 shrink-0 mt-0.5" size={14} />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-xs text-gray-400">
                  Generated {timeAgo(briefing.generatedAt)}
                  {stale && ' · your data has changed since — refresh for an up-to-date read'}
                </p>
              </div>
            )}
          </div>

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
            ✨ The cards above update automatically as you make sales. The briefing is written on
            demand by Claude — ask for a fresh one whenever the numbers move.
          </p>
        </div>
      )}
    </div>
  );
};

export default InsightsPage;
