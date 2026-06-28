import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutGrid, Receipt, History, Package, Users, Settings, LogOut, CreditCard, Sparkles, MessageSquare, ShieldCheck,
} from 'lucide-react';
import POSPage from './POSPage';
import HistoryPage from './HistoryPage';
import ProductsPage from './ProductsPage';
import CustomersPage from './CustomersPage';
import SettingsPage from './SettingsPage';
import DashboardPage from './DashboardPage';
import BillingPage from './BillingPage';
import InsightsPage from './InsightsPage';
import AskTallioPage from './AskTallioPage';
import TeamPage from './TeamPage';
import DemoBanner from '../components/DemoBanner';
import { roleLabel } from '../lib/roles';
import type { OrgRole } from '../types';

type Tab = 'dashboard' | 'insights' | 'ask' | 'pos' | 'history' | 'products' | 'customers' | 'team' | 'billing' | 'settings';

// `roles` omitted = visible to everyone; otherwise restricted to those roles.
const NAV: { id: Tab; label: string; icon: React.ElementType; section: string; roles?: OrgRole[] }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid, section: 'Overview' },
  { id: 'insights', label: 'Insights', icon: Sparkles, section: 'Overview' },
  { id: 'ask', label: 'Ask Tallio', icon: MessageSquare, section: 'Overview' },
  { id: 'pos', label: 'New bill', icon: Receipt, section: 'Billing', roles: ['owner', 'cashier'] },
  { id: 'history', label: 'Bill history', icon: History, section: 'Billing' },
  { id: 'products', label: 'Products', icon: Package, section: 'Catalogue' },
  { id: 'customers', label: 'Customers', icon: Users, section: 'Catalogue' },
  { id: 'team', label: 'Team', icon: ShieldCheck, section: 'System', roles: ['owner'] },
  { id: 'billing', label: 'Billing & Plan', icon: CreditCard, section: 'System', roles: ['owner'] },
  { id: 'settings', label: 'Settings', icon: Settings, section: 'System', roles: ['owner'] },
];

const DashboardShell: React.FC = () => {
  const { org, role, logout, refreshOrg } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [billingMsg, setBillingMsg] = useState('');

  const visibleNav = NAV.filter((item) => !item.roles || (role && item.roles.includes(role)));

  // Let any page request navigation (e.g. "Upgrade plan" links)
  useEffect(() => {
    const handler = (e: Event) => {
      const dest = (e as CustomEvent).detail as Tab;
      if (dest) setTab(dest);
    };
    window.addEventListener('tallio:nav', handler);
    return () => window.removeEventListener('tallio:nav', handler);
  }, []);

  // Handle return from Stripe Checkout (?billing=success|cancelled)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get('billing');
    if (!billing) return;
    if (billing === 'success') {
      setBillingMsg('🎉 Payment successful! Your plan is being activated…');
      setTab('billing');
      // The webhook updates the plan server-side; refresh a moment later.
      setTimeout(() => refreshOrg(), 2500);
      setTimeout(() => setBillingMsg(''), 8000);
    } else if (billing === 'cancelled') {
      setBillingMsg('Checkout cancelled — no charge was made.');
      setTab('billing');
      setTimeout(() => setBillingMsg(''), 6000);
    }
    // Clean the query param from the URL.
    window.history.replaceState({}, '', window.location.pathname);
  }, [refreshOrg]);

  let lastSection = '';

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <DemoBanner />
      {billingMsg && (
        <div className="bg-green-50 border-b border-green-200 text-green-800 text-sm px-4 py-2 text-center">
          {billingMsg}
        </div>
      )}
      <div className="flex flex-1 min-h-0">
      <aside className="w-56 bg-white border-r flex flex-col">
        <div className="px-4 py-4 border-b">
          <div className="text-base font-semibold text-gray-900">{org?.name}</div>
          <div className="text-xs text-gray-400">
            {roleLabel(role)} · {org?.currency.code} {org?.currency.symbol}
          </div>
        </div>
        <nav className="flex-1 py-2">
          {visibleNav.map((item) => {
            const showSection = item.section !== lastSection;
            lastSection = item.section;
            const Icon = item.icon;
            return (
              <React.Fragment key={item.id}>
                {showSection && (
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 px-4 pt-3 pb-1">
                    {item.section}
                  </div>
                )}
                <button
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors border-l-2 ${
                    tab === item.id
                      ? 'bg-gray-50 text-gray-900 border-gray-900 font-medium'
                      : 'text-gray-500 border-transparent hover:bg-gray-50 hover:text-gray-800'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              </React.Fragment>
            );
          })}
        </nav>
        <button
          onClick={logout}
          className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-500 border-t hover:text-gray-800"
        >
          <LogOut size={16} /> Sign out
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {tab === 'dashboard' && <DashboardPage />}
          {tab === 'insights' && <InsightsPage />}
          {tab === 'ask' && <AskTallioPage />}
          {tab === 'pos' && <POSPage />}
          {tab === 'history' && <HistoryPage />}
          {tab === 'products' && <ProductsPage />}
          {tab === 'customers' && <CustomersPage />}
          {tab === 'team' && <TeamPage />}
          {tab === 'billing' && <BillingPage />}
          {tab === 'settings' && <SettingsPage />}
        </div>
      </main>
      </div>
    </div>
  );
};

export default DashboardShell;
