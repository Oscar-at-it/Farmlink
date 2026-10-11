import { useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';

const UNITS = ['piece', 'bag', 'kg', 'bottle', 'pack', 'sachet', 'vial', 'litre'];
const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : NaN; };

export default function ProductForm({ product, categories, onClose, onSaved, onCategoryCreated }) {
  const editing = !!product;
  const [f, setF] = useState({
    name: product?.name || '', category: product?.category?._id || categories[0]?._id || '',
    unit: product?.unit || 'piece', price: product?.price ?? '', cost: product?.cost ?? '',
    barcode: product?.barcode || '', lowStockThreshold: product?.lowStockThreshold ?? 5, stockQty: '',
  });
  const [newCat, setNewCat] = useState(null);   // string while "new category" is being typed
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const below = n(f.price) < n(f.cost);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!f.name.trim()) return setError('Enter a product name.');
    if (Number.isNaN(n(f.price)) || Number.isNaN(n(f.cost))) return setError('Enter the selling price and the cost price as numbers.');
    if (newCat === null && !f.category) return setError('Choose a category.');
    if (newCat !== null && !newCat.trim()) return setError('Enter a name for the new category.');
    setBusy(true);
    try {
      let category = f.category;
      if (newCat !== null) {
        const c = await api('/categories', { method: 'POST', body: { name: newCat.trim() } });
        category = c.category._id;
        onCategoryCreated(c.category);
      }
      const body = {
        name: f.name.trim(), category, unit: f.unit.trim() || 'piece',
        price: n(f.price), cost: n(f.cost), lowStockThreshold: n(f.lowStockThreshold) || 0,
        barcode: f.barcode.trim() || undefined,
      };
      if (editing) {
        await api(`/products/${product._id}`, { method: 'PATCH', body });
      } else {
        const d = await api('/products', { method: 'POST', body: { ...body, stockQty: 0 } });
        // Opening stock goes through the restock route so it appears in the movement log
        if (n(f.stockQty) > 0) await api(`/stock/restock/${d.product._id}`, { method: 'POST', body: { qty: n(f.stockQty), note: 'Opening stock' } });
      }
      onSaved(editing ? 'Product updated.' : 'Product added.');
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <Modal title={editing ? 'Edit product' : 'Add product'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <label className="span2">Product name
          <input value={f.name} onChange={e => set('name', e.target.value)} autoFocus placeholder="e.g. Urea (50kg)" />
        </label>
        <label>Category
          {newCat === null ? (
            <select value={f.category} onChange={e => e.target.value === '__new' ? setNewCat('') : set('category', e.target.value)}>
              {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              <option value="__new">+ New category…</option>
            </select>
          ) : (
            <span className="row">
              <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="New category name" autoFocus />
              <button type="button" className="btn btn--ghost" onClick={() => setNewCat(null)}>Cancel</button>
            </span>
          )}
        </label>
        <label>Unit
          <input list="units" value={f.unit} onChange={e => set('unit', e.target.value)} />
          <datalist id="units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
        </label>
        <label>Selling price (KSh)<input inputMode="decimal" value={f.price} onChange={e => set('price', e.target.value)} /></label>
        <label>Cost price (KSh)<input inputMode="decimal" value={f.cost} onChange={e => set('cost', e.target.value)} /></label>
        {below && <p className="hint hint--warn span2">The selling price is lower than the cost, so each sale will lose money.</p>}
        <label>Low-stock alert at<input inputMode="decimal" value={f.lowStockThreshold} onChange={e => set('lowStockThreshold', e.target.value)} /></label>
        <label>Barcode (optional)<input value={f.barcode} onChange={e => set('barcode', e.target.value)} /></label>
        {!editing && (
          <label className="span2">Opening stock (optional)
            <input inputMode="decimal" value={f.stockQty} onChange={e => set('stockQty', e.target.value)} placeholder="How many are on the shelf now" />
          </label>
        )}
        {editing && <p className="hint span2">To change the quantity in stock, use Restock or Adjust so the change is recorded.</p>}
        <footer className="span2">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add product'}</button>
        </footer>
      </form>
    </Modal>
  );
}
