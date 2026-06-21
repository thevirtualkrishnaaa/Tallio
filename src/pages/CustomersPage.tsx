import React, { useState } from 'react';
import { addDoc, deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Plus, Trash2, Edit3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrgCollection } from '../lib/useOrgCollection';
import { orgCol, orgDoc } from '../lib/orgData';
import { can } from '../lib/roles';
import type { Customer } from '../types';
import Modal from '../components/Modal';

const empty: Partial<Customer> = { name: '', phone: '', email: '', address: '', balance: 0, totalSpend: 0 };

const CustomersPage: React.FC = () => {
  const { org, role } = useAuth();
  const { data: customers, loading } = useOrgCollection<Customer>('customers');
  const canEdit = can.manageCustomers(role);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);

  if (!org) return null;
  const currency = org.currency.symbol;

  const openAdd = () => { setEditing({ ...empty }); setShow(true); };
  const openEdit = (c: Customer) => { setEditing({ ...c }); setShow(true); };

  const save = async () => {
    if (!editing?.name?.trim()) return;
    const payload = { ...editing, name: editing.name.trim() };
    delete (payload as any).id;
    if (editing.id) {
      await setDoc(orgDoc(org.id, 'customers', editing.id), payload, { merge: true });
    } else {
      await addDoc(orgCol(org.id, 'customers'), { ...payload, balance: 0, totalSpend: 0, createdAt: serverTimestamp() });
    }
    setShow(false);
    setEditing(null);
  };

  const remove = async (id: string) => {
    if (window.confirm('Delete this customer?')) await deleteDoc(orgDoc(org.id, 'customers', id));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Customers</h2>
          <p className="text-sm text-gray-500">Track who you sell to and their balances.</p>
        </div>
        {canEdit && (
          <button onClick={openAdd} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800 flex items-center gap-1.5">
            <Plus size={16} /> Add customer
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border">
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Loading…</p>
        ) : customers.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No customers yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-gray-400 border-b">
                <th className="text-left font-medium px-4 py-3">Name</th>
                <th className="text-left font-medium px-4 py-3">Contact</th>
                <th className="text-right font-medium px-4 py-3">Total spend</th>
                <th className="text-right font-medium px-4 py-3">Balance due</th>
                {canEdit && <th className="text-center font-medium px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.phone || c.email || '—'}</td>
                  <td className="px-4 py-3 text-right">{currency}{Number(c.totalSpend || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{currency}{Number(c.balance || 0).toFixed(2)}</td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-gray-800"><Edit3 size={16} /></button>
                        <button onClick={() => remove(c.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal show={show} onClose={() => setShow(false)} title={editing?.id ? 'Edit customer' : 'Add customer'}>
        {editing && (
          <div className="space-y-3">
            <Field label="Name"><input className="input" value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone"><input className="input" value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
              <Field label="Email"><input className="input" value={editing.email || ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
            </div>
            <Field label="Address"><input className="input" value={editing.address || ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
            <div className="flex gap-3 pt-2">
              <button onClick={save} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800">Save</button>
              <button onClick={() => setShow(false)} className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )}
      </Modal>
      <style>{`.input { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }`}</style>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div><label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>{children}</div>
);

export default CustomersPage;
