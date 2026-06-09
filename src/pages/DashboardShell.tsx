import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutGrid, Receipt, History, Package, Users, Settings, LogOut,
} from 'lucide-react';
import POSPage from './POSPage';
import HistoryPage from './HistoryPage';
import ProductsPage from './ProductsPage';
import CustomersPage from './CustomersPage';
import SettingsPage from './SettingsPage';
import DashboardPage from './DashboardPage';
import DemoBanner from '../components/DemoBanner';

type Tab = 'dashboard' | 'pos' | 'history' | 'products' | 'customers' | 'settings';

const NAV: { id: Tab; label: string; icon: React.ElementType; section: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid, section: 'Overview' },
  { id: 'pos', label: 'New bill', icon: Receipt, section: 'Billing' },
  { id: 'history', label: 'Bill history', icon: History, section: 'Billing' },
  { id: 'products', label: 'Products', icon: Package, section: 'Catalogue' },
  { id: 'customers', label: 'Customers', icon: Users, section: 'Catalogue' },
  { id: 'settings', label: 'Settings', icon: Settings, section: 'System' },
];

const DashboardShell: React.FC = () => {
  const { org, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  let lastSection = '';

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <DemoBanner />
      <div className="flex flex-1 min-h-0">
      <aside className="w-56 bg-white border-r flex flex-col">
        <div className="px-4 py-4 border-b">
          <div className="text-base font-semibold text-gray-900">{org?.name}</div>
          <div className="text-xs text-gray-400">
            Currency: {org?.currency.code} {org?.currency.symbol}
          </div>
        </div>
        <nav className="flex-1 py-2">
          {NAV.map((item) => {
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
          {tab === 'pos' && <POSPage />}
          {tab === 'history' && <HistoryPage />}
          {tab === 'products' && <ProductsPage />}
          {tab === 'customers' && <CustomersPage />}
          {tab === 'settings' && <SettingsPage />}
        </div>
      </main>
      </div>
    </div>
  );
};

export default DashboardShell;
