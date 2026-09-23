import React, { useMemo, useState } from 'react';
import { addDoc, deleteDoc, orderBy, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import {
  Plus,
  Trash2,
  Edit3,
  Receipt,
  TrendingDown,
  DollarSign,
  PieChart,
  Search,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrgCollection } from '../lib/useOrgCollection';
import { orgCol, orgDoc, withoutId } from '../lib/orgData';
import { can } from '../lib/roles';
import { toMs } from '../lib/insights';
import type { Expense, ExpenseCategory, PaymentMethod, Bill } from '../types';
import Modal from '../components/Modal';

const CATEGORIES: { id: ExpenseCategory; label: string; color: string }[] = [
  { id: 'Inventory', label: 'Inventory / Supplies', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'Rent', label: 'Rent & Lease', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'Salaries', label: 'Staff & Wages', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'Utilities', label: 'Utilities & Bills', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'Marketing', label: 'Marketing & Ads', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'Maintenance', label: 'Repairs & Upkeep', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: 'Software', label: 'Software & Tools', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { id: 'Tax', label: 'Taxes & Licenses', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'Other', label: 'Other Expenses', color: 'bg-gray-100 text-gray-700 border-gray-200' },
];

const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Card', 'Bank Transfer', 'UPI', 'Other'];

type DateFilter = 'this_month' | 'last_30' | 'this_year' | 'all';

interface ExpenseFormState {
  id?: string;
  title: string;
  amount: number | string;
  category: ExpenseCategory;
  dateStr: string;
  paymentMethod: PaymentMethod;
  vendor: string;
  notes: string;
}

const defaultForm = (): ExpenseFormState => ({
  title: '',
  amount: '',
  category: 'Inventory',
  dateStr: new Date().toISOString().slice(0, 10),
  paymentMethod: 'Bank Transfer',
  vendor: '',
  notes: '',
});

const ExpensesPage: React.FC = () => {
  const { org, role, user } = useAuth();
  const { data: expenses, loading: loadingExpenses } = useOrgCollection<Expense>('expenses', [
    orderBy('createdAt', 'desc'),
  ]);
  const { data: bills } = useOrgCollection<Bill>('bills');

  const canEdit = can.manageExpenses(role);

  const [dateFilter, setDateFilter] = useState<DateFilter>('this_month');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>(defaultForm());
  const [busy, setBusy] = useState(false);

  // Time boundaries
  const now = new Date();
  const startOfThisMonthMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const startOfThisYearMs = new Date(now.getFullYear(), 0, 1).getTime();
  const thirtyDaysAgoMs = now.getTime() - 30 * 24 * 60 * 60 * 1000;

  // Filtered expenses based on active filters
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const ms = toMs(e.date) ?? toMs(e.createdAt) ?? 0;

      // Date filtering
      if (dateFilter === 'this_month' && ms < startOfThisMonthMs) return false;
      if (dateFilter === 'last_30' && ms < thirtyDaysAgoMs) return false;
      if (dateFilter === 'this_year' && ms < startOfThisYearMs) return false;

      // Category filtering
      if (categoryFilter !== 'All' && e.category !== categoryFilter) return false;

      // Search query filtering
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = e.title?.toLowerCase().includes(q);
        const matchVendor = e.vendor?.toLowerCase().includes(q);
        const matchNotes = e.notes?.toLowerCase().includes(q);
        if (!matchTitle && !matchVendor && !matchNotes) return false;
      }

      return true;
    });
  }, [expenses, dateFilter, categoryFilter, searchQuery, startOfThisMonthMs, startOfThisYearMs, thirtyDaysAgoMs]);

  // Overall & Month KPIs
  const totalFilteredExpenses = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [filteredExpenses]
  );

  const monthExpenses = useMemo(() => {
    return expenses
      .filter((e) => (toMs(e.date) ?? toMs(e.createdAt) ?? 0) >= startOfThisMonthMs)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [expenses, startOfThisMonthMs]);

  const monthRevenue = useMemo(() => {
    return bills
      .filter((b) => (toMs(b.createdAt) ?? 0) >= startOfThisMonthMs)
      .reduce((sum, b) => sum + (b.total || 0), 0);
  }, [bills, startOfThisMonthMs]);

  const monthGrossProfit = useMemo(() => {
    return bills
      .filter((b) => (toMs(b.createdAt) ?? 0) >= startOfThisMonthMs)
      .reduce(
        (sum, b) =>
          sum + (b.items || []).reduce((is, i) => is + (i.unitPrice - (i.unitCost || 0)) * i.quantity, 0),
        0
      );
  }, [bills, startOfThisMonthMs]);

  const monthNetProfit = monthGrossProfit - monthExpenses;

  // Category breakdown for current filtered items
  const categoryTotals = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    filteredExpenses.forEach((e) => {
      const cur = map.get(e.category) || 0;
      map.set(e.category, cur + (Number(e.amount) || 0));
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredExpenses]);

  const topCategory = categoryTotals[0] ?? null;

  if (!org) return null;
  const currency = org.currency.symbol;

  const openAdd = () => {
    setForm(defaultForm());
    setShowModal(true);
  };

  const openEdit = (e: Expense) => {
    const dMs = toMs(e.date) ?? toMs(e.createdAt);
    const dateStr = dMs ? new Date(dMs).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    setForm({
      id: e.id,
      title: e.title,
      amount: e.amount,
      category: e.category,
      dateStr,
      paymentMethod: e.paymentMethod || 'Bank Transfer',
      vendor: e.vendor || '',
      notes: e.notes || '',
    });
    setShowModal(true);
  };

  const saveExpense = async () => {
    if (!form.title.trim() || Number(form.amount) <= 0 || !user) return;
    setBusy(true);
    try {
      const dateObj = new Date(form.dateStr);
      const dateTimestamp = Timestamp.fromDate(isNaN(dateObj.getTime()) ? new Date() : dateObj);

      const payload = withoutId({
        title: form.title.trim(),
        amount: Number(form.amount),
        category: form.category,
        date: dateTimestamp,
        paymentMethod: form.paymentMethod,
        vendor: form.vendor.trim() || null,
        notes: form.notes.trim() || null,
        updatedAt: serverTimestamp(),
      });

      if (form.id) {
        await setDoc(orgDoc(org.id, 'expenses', form.id), payload, { merge: true });
      } else {
        await addDoc(orgCol(org.id, 'expenses'), {
          ...payload,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      setShowModal(false);
      setForm(defaultForm());
    } catch (err) {
      console.error(err);
      alert('Failed to save expense. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const removeExpense = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      try {
        await deleteDoc(orgDoc(org.id, 'expenses', id));
      } catch (err) {
        console.error(err);
        alert('Failed to delete expense.');
      }
    }
  };

  const getCategoryBadge = (cat: ExpenseCategory) => {
    const def = CATEGORIES.find((c) => c.id === cat) || CATEGORIES[CATEGORIES.length - 1];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${def.color}`}>
        {def.label}
      </span>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Expenses & Net Profit</h2>
          <p className="text-sm text-gray-500">Track operating overheads, supplier costs, and monthly net income.</p>
        </div>
        {canEdit && (
          <button
            onClick={openAdd}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus size={16} /> Log expense
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
            <TrendingDown size={20} />
          </div>
          <div>
            <div className="text-xs text-gray-400 font-medium">
              {dateFilter === 'this_month' ? 'This month' : 'Filtered'} expenses
            </div>
            <div className="text-lg font-bold text-gray-900">{currency}{totalFilteredExpenses.toFixed(2)}</div>
            <div className="text-xs text-gray-400">{filteredExpenses.length} entries</div>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
            <DollarSign size={20} />
          </div>
          <div>
            <div className="text-xs text-gray-400 font-medium">This month revenue</div>
            <div className="text-lg font-bold text-gray-900">{currency}{monthRevenue.toFixed(2)}</div>
            <div className="text-xs text-gray-400">Gross: {currency}{monthGrossProfit.toFixed(2)}</div>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            monthNetProfit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
          }`}>
            <Receipt size={20} />
          </div>
          <div>
            <div className="text-xs text-gray-400 font-medium">This month Net Profit</div>
            <div className={`text-lg font-bold ${monthNetProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {monthNetProfit < 0 ? '-' : ''}{currency}{Math.abs(monthNetProfit).toFixed(2)}
            </div>
            <div className="text-xs text-gray-400">
              {monthRevenue > 0 ? `${((monthNetProfit / monthRevenue) * 100).toFixed(1)}% net margin` : 'Gross − Expenses'}
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
            <PieChart size={20} />
          </div>
          <div>
            <div className="text-xs text-gray-400 font-medium">Top expense area</div>
            <div className="text-sm font-bold text-gray-900 truncate max-w-[140px]">
              {topCategory ? topCategory[0] : 'None'}
            </div>
            <div className="text-xs text-gray-400">
              {topCategory ? `${currency}${topCategory[1].toFixed(2)}` : 'No data'}
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white border rounded-xl p-4 mb-6 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
          {/* Date Filter Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-xs font-medium text-gray-600 self-start">
            <button
              onClick={() => setDateFilter('this_month')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                dateFilter === 'this_month' ? 'bg-white text-gray-900 shadow-xs font-semibold' : 'hover:text-gray-900'
              }`}
            >
              This month
            </button>
            <button
              onClick={() => setDateFilter('last_30')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                dateFilter === 'last_30' ? 'bg-white text-gray-900 shadow-xs font-semibold' : 'hover:text-gray-900'
              }`}
            >
              Last 30 days
            </button>
            <button
              onClick={() => setDateFilter('this_year')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                dateFilter === 'this_year' ? 'bg-white text-gray-900 shadow-xs font-semibold' : 'hover:text-gray-900'
              }`}
            >
              This year
            </button>
            <button
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                dateFilter === 'all' ? 'bg-white text-gray-900 shadow-xs font-semibold' : 'hover:text-gray-900'
              }`}
            >
              All time
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              type="text"
              placeholder="Search expenses or vendor…"
              className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
          <button
            onClick={() => setCategoryFilter('All')}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors border ${
              categoryFilter === 'All'
                ? 'bg-gray-900 text-white border-gray-900 font-medium'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            All categories
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors border ${
                categoryFilter === cat.id
                  ? 'bg-gray-900 text-white border-gray-900 font-medium'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loadingExpenses ? (
          <p className="p-8 text-sm text-gray-400 text-center">Loading expenses…</p>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="mx-auto text-gray-300 mb-3" size={36} />
            <p className="text-sm font-medium text-gray-800">No expenses found</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              {expenses.length === 0
                ? 'Record your shop overheads, supplies, rent, and staff costs to see accurate net profit calculations.'
                : 'No expenses matched the selected date or category filters.'}
            </p>
            {canEdit && expenses.length === 0 && (
              <button
                onClick={openAdd}
                className="mt-4 bg-gray-900 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-gray-800"
              >
                Log your first expense
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b bg-gray-50/75">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Title & Vendor</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Payment</th>
                  <th className="px-4 py-3 font-semibold text-right">Amount</th>
                  {canEdit && <th className="px-4 py-3 font-semibold text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredExpenses.map((exp) => {
                  const dMs = toMs(exp.date) ?? toMs(exp.createdAt);
                  const displayDate = dMs ? new Date(dMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
                  return (
                    <tr key={exp.id} className="hover:bg-gray-50/75 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{displayDate}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{exp.title}</div>
                        {(exp.vendor || exp.notes) && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                            {exp.vendor && <span className="text-gray-600 font-normal">{exp.vendor}</span>}
                            {exp.vendor && exp.notes && ' · '}
                            {exp.notes && <span>{exp.notes}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{getCategoryBadge(exp.category)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {exp.paymentMethod || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {currency}{Number(exp.amount).toFixed(2)}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openEdit(exp)}
                              className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                              title="Edit expense"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              onClick={() => removeExpense(exp.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Delete expense"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal
        show={showModal}
        onClose={() => setShowModal(false)}
        title={form.id ? 'Edit Expense' : 'Log New Expense'}
      >
        <div className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Expense Title *</label>
            <input
              type="text"
              placeholder="e.g. Arabica Coffee Beans restock, Store Rent"
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount ({currency}) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="input"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                className="input"
                value={form.dateStr}
                onChange={(e) => setForm({ ...form, dateStr: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category *</label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                className="input"
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vendor / Supplier</label>
            <input
              type="text"
              placeholder="e.g. Origin Coffee Roasters Ltd"
              className="input"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes / Receipt Ref</label>
            <textarea
              rows={2}
              placeholder="Optional notes or invoice reference…"
              className="input"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !form.title.trim() || Number(form.amount) <= 0}
              onClick={saveExpense}
              className="bg-gray-900 text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {busy ? 'Saving…' : form.id ? 'Save changes' : 'Add expense'}
            </button>
          </div>
        </div>
      </Modal>

      <style>{`.input { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.45rem 0.75rem; font-size: 0.825rem; } .input:focus { outline: none; border-color: #111827; box-shadow: 0 0 0 2px rgba(17, 24, 39, 0.1); }`}</style>
    </div>
  );
};

export default ExpensesPage;
