import { useState } from 'react';
import { api, kes } from '../api.js';
import Modal from './Modal.jsx';

const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : NaN; };

export function RestockDialog({ product, onClose, onDone }) {
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiry, setExpiry] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!(n(qty) > 0)) return setError('Enter how many units arrived.');
    if (cost !== '' && Number.isNaN(n(cost))) return setError('The new cost must be a number.');
    setBusy(true); setError('');
    try {
      await api(`/stock/restock/${product._id}`, { method: 'POST', body: {
        qty: n(qty), cost: cost === '' ? undefined : n(cost),
        batchNo: batchNo.trim() || undefined, expiryDate: expiry || undefined, note: note.trim() || undefined,
      } });
      onDone(`Added ${n(qty)} ${product.unit} to ${product.name}.`);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <Modal title={`Restock ${product.name}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="hint span2">Now in stock: <strong>{product.stockQty} {product.unit}</strong></p>
        {error && <div className="alert alert--error span2" role="alert">{error}</div>}
        <label>Quantity received<input inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} autoFocus /></label>
        <label>New cost per {product.unit} (optional)
          <input inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder={product.cost !== undefined ? `Now ${kes(product.cost)}` : ''} />
        </label>
        <label>Batch number (optional)<input value={batchNo} onChange={e => setBatchNo(e.target.value)} /></label>
        <label>Expiry date (optional)<input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></label>
        <label className="span2">Note (optional)<input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Delivery from Kenya Seed" /></label>
        <footer className="span2">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Add stock'}</button>
        </footer>
      </form>
    </Modal>
  );
}

export function AdjustDialog({ product, onClose, onDone }) {
  const [count, setCount] = useState(String(product.stockQty));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const diff = n(count) - product.stockQty;

  async function submit(e) {
    e.preventDefault();
    if (Number.isNaN(n(count)) || n(count) < 0) return setError('Enter the counted quantity (0 or more).');
    if (note.trim().length < 1) return setError('Say why the count changed, for example "stocktake" or "damaged".');
    setBusy(true); setError('');
    try {
      await api(`/stock/adjust/${product._id}`, { method: 'POST', body: { newQty: n(count), note: note.trim() } });
      onDone(`Stock for ${product.name} set to ${n(count)} ${product.unit}.`);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <Modal title={`Adjust ${product.name}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="hint span2">Use this after a physical count. The system currently shows <strong>{product.stockQty} {product.unit}</strong>.</p>
        {error && <div className="alert alert--error span2" role="alert">{error}</div>}
        <label>Counted quantity<input inputMode="decimal" value={count} onChange={e => setCount(e.target.value)} autoFocus /></label>
        <label>Difference<input readOnly value={Number.isNaN(diff) ? '' : (diff > 0 ? '+' : '') + diff} /></label>
        <label className="span2">Reason<input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Stocktake, damaged, expired" /></label>
        <footer className="span2">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save count'}</button>
        </footer>
      </form>
    </Modal>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <div className="form">
        <p className="span2">{message}</p>
        <footer className="span2">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); }}>{confirmLabel}</button>
        </footer>
      </div>
    </Modal>
  );
}
