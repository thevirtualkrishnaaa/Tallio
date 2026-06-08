import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const CURRENCIES = [
  { code: 'GBP', symbol: '£', label: 'GBP — British Pound £' },
  { code: 'USD', symbol: '$', label: 'USD — US Dollar $' },
  { code: 'EUR', symbol: '€', label: 'EUR — Euro €' },
  { code: 'INR', symbol: '₹', label: 'INR — Indian Rupee ₹' },
  { code: 'JPY', symbol: '¥', label: 'JPY — Japanese Yen ¥' },
  { code: 'AUD', symbol: 'A$', label: 'AUD — Australian Dollar A$' },
  { code: 'CAD', symbol: 'C$', label: 'CAD — Canadian Dollar C$' },
  { code: 'AED', symbol: 'د.إ', label: 'AED — UAE Dirham د.إ' },
  { code: 'SGD', symbol: 'S$', label: 'SGD — Singapore Dollar S$' },
  { code: 'BRL', symbol: 'R$', label: 'BRL — Brazilian Real R$' },
];

const OnboardingPage: React.FC = () => {
  const { createOrganization, logout } = useAuth();
  const [name, setName] = useState('');
  const [currencyIdx, setCurrencyIdx] = useState(3); // INR default
  const [taxRate, setTaxRate] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a business name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const c = CURRENCIES[currencyIdx];
      await createOrganization(name.trim(), c.code, c.symbol, taxRate);
    } catch (err: any) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-md p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Set up your business</h1>
        <p className="text-sm text-gray-500 mb-6">
          This creates your organization workspace. You can invite teammates later.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Business name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="e.g., Krishna Retail Mart"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
            <select
              value={currencyIdx}
              onChange={(e) => setCurrencyIdx(parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {CURRENCIES.map((c, i) => (
                <option key={c.code} value={i}>{c.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">All amounts across the app will be shown in this currency.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Default tax rate (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={taxRate}
              onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <p className="text-xs text-gray-400 mt-1">Pre-filled on new bills — can be changed per bill.</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create workspace'}
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-full text-gray-500 text-sm py-1 hover:text-gray-800"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
};

export default OnboardingPage;
