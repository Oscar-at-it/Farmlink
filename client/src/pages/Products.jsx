import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, kes } from '../api.js';
import ProductForm from '../components/ProductForm.jsx';
import { RestockDialog, AdjustDialog, ConfirmDialog } from '../components/StockDialogs.jsx';

const fmtDate = d => new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = d => new Date(d).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const TYPE_LABEL = { sale: 'Sale', restock: 'Restock', adjustment: 'Adjustment', void: 'Voided sale' };

export default function Products() {
  const [tab, setTab] = useState('all');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [low, setLow] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [days, setDays] = useState(30);
  const [moves, setMoves] = useState([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [showInactive, setShowInactive] = useState(false);
  const [dialog, setDialog] = useState(null);   // { kind, product }
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [p, c, l] = await Promise.all([api('/products?includeInactive=true'), api('/categories'), api('/stock/low')]);
      setProducts(p.products); setCategories(c.categories); setLow(l.items); setError('');
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (tab === 'expiring') api(`/stock/expiring?days=${days}`).then(d => setExpiring(d.items)).catch(e => setError(e.message));
    if (tab === 'log') api('/stock/movements').then(d => setMoves(d.movements)).catch(e => setError(e.message));
  }, [tab, days, products]);

  const done = msg => { setDialog(null); setNotice(msg); loadAll(); };
  const close = () => setDialog(null);

  const active = useMemo(() => products.filter(p => p.isActive), [products]);
  const stockValue = active.reduce((s, p) => s + p.cost * p.stockQty, 0);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => (showInactive || p.isActive) && (catFilter === 'all' || p.category?._id === catFilter) && (!q || p.name.toLowerCase().includes(q)));
  }, [products, search, catFilter, showInactive]);

  async function setActive(p, isActive) {
    try {
      await (isActive ? api(`/products/${p._id}`, { method: 'PATCH', body: { isActive: true } }) : api(`/products/${p._id}`, { method: 'DELETE' }));
      done(isActive ? `${p.name} is back on sale.` : `${p.name} removed from the till. Past sales are kept.`);
    } catch (e) { setDialog(null); setError(e.message); }
  }

  return (
    <div className="page">
      <div className="page__head">
        <h1>Products and stock</h1>
        <button className="btn btn--primary" onClick={() => setDialog({ kind: 'form' })}>Add product</button>
      </div>

      <p className="stats">
        <span><strong>{active.length}</strong> products</span>
        <span className={low.length ? 'is-warn' : ''}><strong>{low.length}</strong> low on stock</span>
        <span><strong>{kes(stockValue)}</strong> of stock at cost</span>
      </p>

      <div className="tabs" role="tablist">
        {[['all', 'All products'], ['low', `Low stock (${low.length})`], ['expiring', 'Expiring'], ['log', 'Stock history']].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {notice && <div className="alert alert--ok">{notice}<button className="x" onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
      {error && <div className="alert alert--error">{error}<button className="link" onClick={() => { setError(''); loadAll(); }}>Try again</button></div>}

      {tab === 'all' && (
        <>
          <div className="filters">
            <input placeholder="Search products" value={search} onChange={e => setSearch(e.target.value)} />
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} aria-label="Filter by category">
              <option value="all">All categories</option>
              {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <label className="check"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show removed products</label>
          </div>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Product</th><th className="r">Price</th><th className="r">Cost</th><th className="r">Margin</th><th className="r">In stock</th><th></th></tr></thead>
              <tbody>
                {rows.map(p => {
                  const margin = p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
                  return (
                    <tr key={p._id} className={p.isActive ? '' : 'is-off'}>
                      <td><span className="dot" style={{ background: p.category?.color }} />{p.name}<small>{p.category?.name}{p.isActive ? '' : ' · removed'}</small></td>
                      <td className="r">{kes(p.price)}</td>
                      <td className="r">{kes(p.cost)}</td>
                      <td className={'r' + (margin < 10 ? ' is-warn' : '')}>{margin}%</td>
                      <td className="r">
                        <span className={p.isLow && p.isActive ? 'badge badge--low' : ''}>{p.stockQty} {p.unit}</span>
                      </td>
                      <td className="acts">
                        {p.isActive ? (<>
                          <button className="btn btn--sm" onClick={() => setDialog({ kind: 'restock', product: p })}>Restock</button>
                          <button className="btn btn--sm btn--ghost" onClick={() => setDialog({ kind: 'adjust', product: p })}>Adjust</button>
                          <button className="btn btn--sm btn--ghost" onClick={() => setDialog({ kind: 'form', product: p })}>Edit</button>
                          <button className="btn btn--sm btn--ghost" onClick={() => setDialog({ kind: 'remove', product: p })}>Remove</button>
                        </>) : (
                          <button className="btn btn--sm" onClick={() => setActive(p, true)}>Put back on sale</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && <tr><td colSpan="6" className="empty">No products match. Clear the search or add a new product.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'low' && (
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Product</th><th className="r">In stock</th><th className="r">Alert at</th><th></th></tr></thead>
            <tbody>
              {low.map(p => (
                <tr key={p._id}>
                  <td>{p.name}</td>
                  <td className="r"><span className={'badge ' + (p.stockQty <= 0 ? 'badge--out' : 'badge--low')}>{p.stockQty <= 0 ? 'Out of stock' : `${p.stockQty} ${p.unit}`}</span></td>
                  <td className="r">{p.lowStockThreshold} {p.unit}</td>
                  <td className="acts"><button className="btn btn--sm" onClick={() => setDialog({ kind: 'restock', product: { ...p, ...(products.find(x => x._id === p._id) || {}) } })}>Restock</button></td>
                </tr>
              ))}
              {!low.length && <tr><td colSpan="4" className="empty">Nothing is running low. Every product is above its alert level.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'expiring' && (
        <>
          <div className="filters">
            <label className="check">Show batches that expire within
              <select value={days} onChange={e => setDays(Number(e.target.value))}>
                {[30, 60, 90, 180].map(d => <option key={d} value={d}>{d} days</option>)}
              </select>
            </label>
          </div>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Product</th><th>Batch</th><th>Expires</th><th className="r">Received</th></tr></thead>
              <tbody>
                {expiring.map(i => {
                  const left = Math.ceil((new Date(i.batch.expiryDate) - Date.now()) / 864e5);
                  return (
                    <tr key={i.batch._id}>
                      <td>{i.name}</td><td>{i.batch.batchNo || '—'}</td>
                      <td>{fmtDate(i.batch.expiryDate)} <span className={'badge ' + (left < 0 ? 'badge--out' : 'badge--low')}>{left < 0 ? 'Expired' : `${left} days left`}</span></td>
                      <td className="r">{i.batch.qty} {i.unit}</td>
                    </tr>
                  );
                })}
                {!expiring.length && <tr><td colSpan="4" className="empty">No batches expire in the next {days} days. Add an expiry date when you restock vet products and pesticides to see them here.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'log' && (
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>When</th><th>Product</th><th>What happened</th><th className="r">Change</th><th className="r">Stock after</th><th>By</th><th>Note</th></tr></thead>
            <tbody>
              {moves.map(m => (
                <tr key={m._id}>
                  <td>{fmtTime(m.createdAt)}</td><td>{m.product?.name}</td><td>{TYPE_LABEL[m.type] || m.type}</td>
                  <td className={'r ' + (m.qtyChange < 0 ? 'neg' : 'pos')}>{m.qtyChange > 0 ? '+' : ''}{m.qtyChange}</td>
                  <td className="r">{m.stockAfter}</td><td>{m.by?.fullName}</td><td>{m.note || ''}</td>
                </tr>
              ))}
              {!moves.length && <tr><td colSpan="7" className="empty">No stock movements yet. Sales, restocks and adjustments will appear here.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === 'form' && (
        <ProductForm product={dialog.product} categories={categories} onClose={close} onSaved={done}
          onCategoryCreated={c => setCategories(cs => [...cs, c].sort((a, b) => a.name.localeCompare(b.name)))} />
      )}
      {dialog?.kind === 'restock' && <RestockDialog product={dialog.product} onClose={close} onDone={done} />}
      {dialog?.kind === 'adjust' && <AdjustDialog product={dialog.product} onClose={close} onDone={done} />}
      {dialog?.kind === 'remove' && (
        <ConfirmDialog title="Remove product?" confirmLabel="Remove product" onClose={close} onConfirm={() => setActive(dialog.product, false)}
          message={`${dialog.product.name} will no longer appear on the till. Past sales and reports keep their records, and you can put it back on sale later.`} />
      )}
    </div>
  );
}
