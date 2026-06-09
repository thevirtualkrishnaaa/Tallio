import React, { useState } from 'react';
import { addDoc, deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Plus, Trash2, Edit3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOrgCollection } from '../lib/useOrgCollection';
import { orgCol, orgDoc } from '../lib/orgData';
import { isAtLimit } from '../lib/plans';
import type { Category, Product, AttributeDef } from '../types';
import Modal from '../components/Modal';

const emptyProduct = (categories: Category[]): Partial<Product> => ({
  name: '',
  categoryId: categories[0]?.id || '',
  categoryName: categories[0]?.name || '',
  price: 0,
  cost: 0,
  stock: 0,
  lowStockAlert: 5,
  unit: 'each',
  sku: '',
  attributes: {},
});

const ProductsPage: React.FC = () => {
  const { org, plan } = useAuth();
  const { data: categories } = useOrgCollection<Category>('categories');
  const { data: products, loading } = useOrgCollection<Product>('products');

  const atProductLimit = isAtLimit(plan, 'products', products.length);

  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategory, setNewCategory] = useState<{ name: string; attrs: AttributeDef[] }>({ name: '', attrs: [] });

  if (!org) return null;
  const currency = org.currency.symbol;

  const openAddProduct = () => {
    if (atProductLimit) return;
    setEditingProduct(emptyProduct(categories));
    setShowProductModal(true);
  };
  const openEditProduct = (p: Product) => {
    setEditingProduct({ ...p });
    setShowProductModal(true);
  };

  const selectedCategory = () => categories.find((c) => c.id === editingProduct?.categoryId);

  const saveProduct = async () => {
    if (!editingProduct || !editingProduct.name?.trim()) return;
    const cat = categories.find((c) => c.id === editingProduct.categoryId);
    const payload = {
      ...editingProduct,
      name: editingProduct.name.trim(),
      categoryName: cat?.name || '',
      price: Number(editingProduct.price) || 0,
      cost: Number(editingProduct.cost) || 0,
      stock: Number(editingProduct.stock) || 0,
      lowStockAlert: Number(editingProduct.lowStockAlert) || 0,
      updatedAt: serverTimestamp(),
    };
    delete (payload as any).id;

    if (editingProduct.id) {
      await setDoc(orgDoc(org.id, 'products', editingProduct.id), payload, { merge: true });
    } else {
      await addDoc(orgCol(org.id, 'products'), { ...payload, createdAt: serverTimestamp() });
    }
    setShowProductModal(false);
    setEditingProduct(null);
  };

  const removeProduct = async (id: string) => {
    if (window.confirm('Delete this product?')) {
      await deleteDoc(orgDoc(org.id, 'products', id));
    }
  };

  const saveCategory = async () => {
    if (!newCategory.name.trim()) return;
    await addDoc(orgCol(org.id, 'categories'), {
      name: newCategory.name.trim(),
      attributeSchema: newCategory.attrs.filter((a) => a.key.trim() && a.label.trim()),
      createdAt: serverTimestamp(),
    });
    setNewCategory({ name: '', attrs: [] });
    setShowCategoryModal(false);
  };

  const addAttrRow = () =>
    setNewCategory((s) => ({ ...s, attrs: [...s.attrs, { key: '', label: '', type: 'text' }] }));

  const updateAttrRow = (i: number, patch: Partial<AttributeDef>) =>
    setNewCategory((s) => ({
      ...s,
      attrs: s.attrs.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    }));

  const removeAttrRow = (i: number) =>
    setNewCategory((s) => ({ ...s, attrs: s.attrs.filter((_, idx) => idx !== i) }));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Products</h2>
          <p className="text-sm text-gray-500">Manage your catalogue — any product or service type.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCategoryModal(true)}
            className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
          >
            + Category
          </button>
          <button
            onClick={openAddProduct}
            disabled={categories.length === 0 || atProductLimit}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800 flex items-center gap-1.5 disabled:opacity-40"
          >
            <Plus size={16} /> Add product
          </button>
        </div>
      </div>

      {atProductLimit && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-4 mb-4 flex items-center justify-between gap-3">
          <span>
            You've reached your <strong>{plan.name}</strong> plan limit of{' '}
            {plan.limits.products} products. Upgrade to add more.
          </span>
          <a href="#billing" onClick={() => { window.dispatchEvent(new CustomEvent('tallio:nav', { detail: 'billing' })); }}
            className="bg-amber-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-amber-700 whitespace-nowrap cursor-pointer">
            Upgrade plan
          </a>
        </div>
      )}

      {!atProductLimit && plan.limits.products !== Infinity && products.length >= plan.limits.products - 5 && (
        <div className="bg-gray-50 border text-gray-500 text-xs rounded-lg px-4 py-2 mb-4">
          {products.length} of {plan.limits.products} products used on your {plan.name} plan.
        </div>
      )}

      {categories.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-4 mb-4">
          Create a category first (e.g. "Beverages", "Apparel") — categories define what custom fields your products can have.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border">
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Loading products…</p>
        ) : products.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No products yet. Add your first one!</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-gray-400 border-b">
                <th className="text-left font-medium px-4 py-3">Name</th>
                <th className="text-left font-medium px-4 py-3">Category</th>
                <th className="text-right font-medium px-4 py-3">Price</th>
                <th className="text-right font-medium px-4 py-3">Cost</th>
                <th className="text-right font-medium px-4 py-3">Stock</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-center font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const oos = p.stock <= 0;
                const low = !oos && p.stock <= p.lowStockAlert;
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-3 text-gray-600">{p.categoryName}</td>
                    <td className="px-4 py-3 text-right">{currency}{Number(p.price).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{currency}{Number(p.cost || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">{p.stock} {p.unit}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        oos ? 'bg-red-100 text-red-700' : low ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {oos ? 'Out of stock' : low ? 'Low stock' : 'In stock'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => openEditProduct(p)} className="text-gray-400 hover:text-gray-800"><Edit3 size={16} /></button>
                        <button onClick={() => removeProduct(p.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Product Modal */}
      <Modal show={showProductModal} onClose={() => setShowProductModal(false)} title={editingProduct?.id ? 'Edit product' : 'Add product'}>
        {editingProduct && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Product name">
                <input className="input" value={editingProduct.name || ''} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} placeholder="e.g., Espresso, T-shirt, Consulting hour" />
              </Field>
              <Field label="Category">
                <select className="input" value={editingProduct.categoryId || ''} onChange={(e) => setEditingProduct({ ...editingProduct, categoryId: e.target.value, attributes: {} })}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label={`Price (${currency})`}>
                <input type="number" min={0} step="0.01" className="input" value={editingProduct.price ?? 0} onChange={(e) => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label={`Cost (${currency})`}>
                <input type="number" min={0} step="0.01" className="input" value={editingProduct.cost ?? 0} onChange={(e) => setEditingProduct({ ...editingProduct, cost: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="Unit">
                <input className="input" value={editingProduct.unit || 'each'} onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })} placeholder="each, kg, hour…" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Stock quantity">
                <input type="number" min={0} className="input" value={editingProduct.stock ?? 0} onChange={(e) => setEditingProduct({ ...editingProduct, stock: parseInt(e.target.value) || 0 })} />
              </Field>
              <Field label="Low stock alert">
                <input type="number" min={0} className="input" value={editingProduct.lowStockAlert ?? 0} onChange={(e) => setEditingProduct({ ...editingProduct, lowStockAlert: parseInt(e.target.value) || 0 })} />
              </Field>
              <Field label="SKU / code">
                <input className="input" value={editingProduct.sku || ''} onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })} placeholder="auto if blank" />
              </Field>
            </div>

            {selectedCategory()?.attributeSchema && selectedCategory()!.attributeSchema.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-gray-500 mb-2">Category-specific attributes</p>
                <div className="grid grid-cols-2 gap-3">
                  {selectedCategory()!.attributeSchema.map((attr) => (
                    <Field key={attr.key} label={attr.label}>
                      {attr.type === 'select' ? (
                        <select
                          className="input"
                          value={(editingProduct.attributes?.[attr.key] as string) || ''}
                          onChange={(e) => setEditingProduct({ ...editingProduct, attributes: { ...editingProduct.attributes, [attr.key]: e.target.value } })}
                        >
                          <option value="">—</option>
                          {(attr.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          type={attr.type === 'number' ? 'number' : 'text'}
                          className="input"
                          value={(editingProduct.attributes?.[attr.key] as any) ?? ''}
                          onChange={(e) => setEditingProduct({ ...editingProduct, attributes: { ...editingProduct.attributes, [attr.key]: attr.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value } })}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={saveProduct} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800">Save product</button>
              <button onClick={() => setShowProductModal(false)} className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Category Modal */}
      <Modal show={showCategoryModal} onClose={() => setShowCategoryModal(false)} title="Add category">
        <div className="space-y-3">
          <Field label="Category name">
            <input className="input" value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} placeholder="e.g., Apparel, Electronics, Services" />
          </Field>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-gray-500">Custom attributes (optional)</p>
              <button onClick={addAttrRow} className="text-xs text-gray-600 hover:text-gray-900">+ Add attribute</button>
            </div>
            <p className="text-xs text-gray-400 mb-2">Define fields specific to this category, e.g. "Size", "Voltage", "Color".</p>
            <div className="space-y-2">
              {newCategory.attrs.map((attr, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className="input flex-1" placeholder="Field key (e.g. size)" value={attr.key} onChange={(e) => updateAttrRow(i, { key: e.target.value })} />
                  <input className="input flex-1" placeholder="Label (e.g. Size)" value={attr.label} onChange={(e) => updateAttrRow(i, { label: e.target.value })} />
                  <select className="input w-28" value={attr.type} onChange={(e) => updateAttrRow(i, { type: e.target.value as AttributeDef['type'] })}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="select">Choice</option>
                  </select>
                  <button onClick={() => removeAttrRow(i)} className="text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={saveCategory} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800">Save category</button>
            <button onClick={() => setShowCategoryModal(false)} className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      <style>{`.input { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; } .input:focus { outline: none; box-shadow: 0 0 0 2px #11182733; }`}</style>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
    {children}
  </div>
);

export default ProductsPage;
