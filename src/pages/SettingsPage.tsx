import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';

const CURRENCIES = [
  { code: 'GBP', symbol: '£' }, { code: 'USD', symbol: '$' }, { code: 'EUR', symbol: '€' },
  { code: 'INR', symbol: '₹' }, { code: 'JPY', symbol: '¥' }, { code: 'AUD', symbol: 'A$' },
  { code: 'CAD', symbol: 'C$' }, { code: 'AED', symbol: 'د.إ' }, { code: 'SGD', symbol: 'S$' },
  { code: 'BRL', symbol: 'R$' },
];

const SettingsPage: React.FC = () => {
  const { org, role, refreshOrg } = useAuth();
  const [currencyCode, setCurrencyCode] = useState(org?.currency.code || 'INR');
  const [taxRate, setTaxRate] = useState(org?.defaultTaxRate ?? 0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  if (!org) return null;

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const c = CURRENCIES.find((c) => c.code === currencyCode)!;
      await setDoc(doc(db, 'orgs', org.id), { currency: { code: c.code, symbol: c.symbol }, defaultTaxRate: taxRate }, { merge: true });
      await refreshOrg();
      setMsg('Settings saved.');
    } catch (e: any) {
      setMsg('Failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-1">Settings</h2>
      <p className="text-sm text-gray-500 mb-6">Workspace preferences for {org.name}.</p>

      <div className="bg-white border rounded-xl p-5 max-w-lg space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
          <select className="input" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} disabled={role !== 'owner'}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.symbol}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">Changing currency only affects display — existing amounts are not converted.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Default tax rate (%)</label>
          <input type="number" min={0} max={100} className="input" value={taxRate} onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)} disabled={role !== 'owner'} />
        </div>

        {role === 'owner' && (
          <button onClick={save} disabled={saving} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
        {msg && <p className="text-sm text-gray-600">{msg}</p>}
      </div>
      <style>{`.input { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }`}</style>
    </div>
  );
};

export default SettingsPage;
