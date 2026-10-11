import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, kes } from '../api.js';
import { useAuth } from '../auth.jsx';
import { cache, cachedGet, newClientId, outbox, syncOutbox, useOnline } from '../offline.js';
import Receipt from '../components/Receipt.jsx';

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const round2 = n => Math.round(n * 100) / 100;

export default function Pos() {
  const { user, business } = useAuth();
  const cartKey = `fl_cart_${user._id}`;

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem(cartKey)) || []; } catch { return []; } });
  const [method, setMethod] = useState('cash');
  const [received, setReceived] = useState('');
  const [mpesaCode, setMpesaCode] = useState('');
  const [mpOn, setMpOn] = useState(false);              // STK Push set up on the server
  const [mpPhone, setMpPhone] = useState('');
  const [mp, setMp] = useState(null);                    // payment request: { id, status, amount, paidAmount, receipt, message }
  const [mpManual, setMpManual] = useState(false);       // cashier chose to type the code instead
  const [mpBusy, setMpBusy] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [attach, setAttach] = useState(false);       // show the optional customer picker
  const [newCust, setNewCust] = useState(null);       // { name, phone } while the quick-add form is open
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);    // mobile bottom sheet
  const [stale, setStale] = useState(false);       // showing the last saved product list
  const online = useOnline();
  const searchRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([cachedGet('/products', 'products'), cachedGet('/customers', 'customers')]);
      setProducts(p.data.products); setCustomers(c.data.customers); setStale(p.stale); setLoadError('');
    } catch (e) { setLoadError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { window.addEventListener('fl-synced', load); return () => window.removeEventListener('fl-synced', load); }, [load]);
  useEffect(() => { if (online && stale) load(); }, [online, stale, load]);
  useEffect(() => { localStorage.setItem(cartKey, JSON.stringify(cart)); }, [cart, cartKey]);

  useEffect(() => { api('/mpesa/config').then(d => setMpOn(d.enabled)).catch(() => {}); }, []);
  useEffect(() => {
    const c = customers.find(x => x._id === customerId);
    if (c?.phone && !mpPhone) setMpPhone(c.phone);
  }, [customerId, customers]);   // eslint-disable-line react-hooks/exhaustive-deps

  // While waiting for the customer to enter their PIN, check the result every 3 seconds
  useEffect(() => {
    if (!mp || mp.status !== 'pending') return;
    let stop = false;
    const tick = async () => {
      try { const d = await api(`/mpesa/status/${mp.id}`); if (!stop && d.payment.status !== 'pending') setMp(d.payment); } catch { /* keep waiting */ }
    };
    const t = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [mp?.id, mp?.status]);   // eslint-disable-line react-hooks/exhaustive-deps

  // "/" jumps to search
  useEffect(() => {
    const onKey = e => { if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const categories = useMemo(() => {
    const m = new Map();
    products.forEach(p => p.category && m.set(p.category._id, p.category));
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => (cat === 'all' || p.category?._id === cat) && (!q || p.name.toLowerCase().includes(q) || p.barcode === q));
  }, [products, search, cat]);

  const stockOf = id => products.find(p => p._id === id)?.stockQty ?? 0;

  function add(p) {
    if (p.stockQty <= 0) return;
    setError('');
    setCart(c => {
      const hit = c.find(l => l.id === p._id);
      if (hit) return c.map(l => l.id === p._id ? { ...l, qty: String(Math.min(num(l.qty) + 1, p.stockQty)) } : l);
      return [...c, { id: p._id, name: p.name, unit: p.unit, price: p.price, qty: '1' }];
    });
  }
  const setQty = (id, v) => setCart(c => c.map(l => l.id === id ? { ...l, qty: v } : l));
  const remove = id => setCart(c => c.filter(l => l.id !== id));

  // Enter in the search box (or after a barcode scan) adds the first match
  function onSearchKey(e) {
    if (e.key === 'Enter' && visible.length) { add(visible[0]); setSearch(''); }
  }

  const total = round2(cart.reduce((s, l) => s + l.price * num(l.qty), 0));
  const mpPaid = method === 'mpesa' && mp?.status === 'success' ? (mp.paidAmount ?? mp.amount) : null;   // confirmed by M-Pesa
  const paid = mpPaid !== null ? mpPaid : method === 'credit' ? num(received) : (received === '' ? total : num(received));
  const applied = Math.min(paid, total);
  const owed = round2(total - applied);
  const change = method === 'cash' ? round2(Math.max(paid - total, 0)) : 0;
  const needsCustomer = owed > 0 || method === 'credit';

  async function addCustomer() {
    try {
      const d = await api('/customers', { method: 'POST', body: { name: newCust.name, phone: newCust.phone || undefined } });
      setCustomers(c => [...c, d.customer].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(d.customer._id); setNewCust(null);
    } catch (e) { setError(e.message); }
  }

  async function requestMpesa() {
    setError('');
    if (!cart.length) return setError('Add products to the sale first.');
    if (cart.some(l => num(l.qty) <= 0)) return setError('Check the quantities first.');
    setMpBusy(true);
    try {
      const part = num(received);
      const d = await api('/mpesa/stk', { method: 'POST', body: {
        items: cart.map(l => ({ productId: l.id, qty: num(l.qty) })), phone: mpPhone, amount: part > 0 && part < total ? part : undefined } });
      setMp(d.payment);
    } catch (e) { setError(e.message); } finally { setMpBusy(false); }
  }
  const cancelWaiting = () => setMp(m => (m ? { ...m, status: 'cancelled', message: 'Stopped waiting. If the customer still pays, it will show under Reports, M-Pesa payments.' } : m));

  async function checkout() {
    setError('');
    if (!cart.length) return setError('Add at least one product to the sale.');
    const bad = cart.find(l => num(l.qty) <= 0 || num(l.qty) > stockOf(l.id));
    if (bad) return setError(`Check the quantity for ${bad.name} (in stock: ${stockOf(bad.id)}).`);
    if (needsCustomer && !customerId) return setError('Choose a customer for credit or part payments.');
    if (mp?.status === 'pending') return setError('Still waiting for the customer to pay. Wait for the result, or stop waiting.');
    if (mp?.status === 'success' && method !== 'mpesa') return setError('An M-Pesa payment was received for this sale. Switch back to M-Pesa to use it.');
    if (method === 'mpesa' && applied > 0 && mpPaid === null && !mpesaCode.trim())
      return setError(mpOn && !mpManual ? 'Send the M-Pesa request to the customer, or choose to enter the code instead.' : 'Enter the M-Pesa transaction code.');

    setBusy(true);
    const payload = {
      items: cart.map(l => ({ productId: l.id, qty: num(l.qty) })),
      customerId: customerId || undefined,
      payment: { method, amountPaid: paid, mpesaCode: mpPaid === null ? (mpesaCode.trim() || undefined) : undefined, mpesaPaymentId: mpPaid !== null ? mp.id : undefined },
    };
    try {
      const d = await api('/sales', { method: 'POST', body: payload });
      setReceipt(d.sale);
      setCart([]); setReceived(''); setMpesaCode(''); setMethod('cash'); setCartOpen(false); setMp(null); setMpManual(false);
      if (d.lowStock?.length) setNotice(`Running low: ${d.lowStock.map(p => `${p.name} (${p.stockQty} left)`).join(', ')}`);
      load();
    } catch (e) {
      if (e.network) queueSale(payload); else setError(e.message);
    } finally { setBusy(false); }
  }

  // No connection: keep the sale on this device and send it when the network returns
  function queueSale(payload) {
    const snapshot = { cart, total, applied, change, owed, method, mpesaCode: mpesaCode.trim() || undefined };
    outbox.add({ clientId: newClientId(), biz: business?.id, soldAt: new Date().toISOString(), status: 'waiting', ...payload,
      label: cart.map(l => l.name).join(', '), total });
    setProducts(ps => {
      const next = ps.map(p => { const l = cart.find(x => x.id === p._id); return l ? { ...p, stockQty: round2(p.stockQty - num(l.qty)) } : p; });
      cache.set('products', { ok: true, products: next });
      return next;
    });
    setReceipt({
      pending: true, createdAt: new Date().toISOString(), totalRevenue: snapshot.total, customer: customerId || undefined,
      items: snapshot.cart.map(l => ({ productName: l.name, unit: l.unit, qty: num(l.qty), unitPrice: l.price, lineRevenue: round2(l.price * num(l.qty)) })),
      payment: { method: snapshot.method, amountPaid: snapshot.applied, change: snapshot.change, balanceOwed: snapshot.owed, mpesaCode: snapshot.mpesaCode },
    });
    setCart([]); setReceived(''); setMpesaCode(''); setMethod('cash'); setCartOpen(false); setMp(null); setMpManual(false);
    setNotice('No connection, so the sale was saved on this device. It will be sent automatically when you are back online.');
    syncOutbox();
  }

  function newSale() { setReceipt(null); setCustomerId(''); setAttach(false); searchRef.current?.focus(); }
  const customerName = customers.find(c => c._id === (receipt?.customer?._id || receipt?.customer || customerId))?.name;
  const itemCount = cart.length;

  return (
    <div className="pos">
      <section className="catalog">
        <div className="catalog__tools">
          <input ref={searchRef} className="search" placeholder="Search or scan a product  (press / to jump here)"
            value={search} onChange={e => setSearch(e.target.value)} onKeyDown={onSearchKey} />
          <div className="chips" role="tablist">
            <button className={'chip' + (cat === 'all' ? ' is-on' : '')} onClick={() => setCat('all')}>All</button>
            {categories.map(c => (
              <button key={c._id} className={'chip' + (cat === c._id ? ' is-on' : '')} onClick={() => setCat(c._id)}>{c.name}</button>
            ))}
          </div>
        </div>

        {!online && <div className="alert alert--warn">You are offline. You can keep selling, and sales are sent when the connection returns.</div>}
        {stale && online === false && <p className="hint">Showing the product list as it was when you last had a connection.</p>}
        {notice && <div className="alert alert--warn">{notice}<button className="x" onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
        {loadError && <div className="alert alert--error">Could not load products: {loadError}. <button className="link" onClick={load}>Try again</button></div>}

        <div className="grid">
          {visible.map(p => {
            const out = p.stockQty <= 0;
            return (
              <button key={p._id} className={'card' + (out ? ' is-out' : '')} style={{ '--cat': p.category?.color }} disabled={out} onClick={() => add(p)}>
                <span className="card__name">{p.name}</span>
                <span className="card__price">{kes(p.price)}<small> / {p.unit}</small></span>
                <span className={'card__stock' + (p.isLow ? ' is-low' : '')}>{out ? 'Out of stock' : `${p.stockQty} ${p.unit} left`}</span>
              </button>
            );
          })}
          {!visible.length && !loadError && <p className="empty">No products match “{search}”. Check the spelling or pick another category.</p>}
        </div>
      </section>

      <aside className={'till' + (cartOpen ? ' is-open' : '')}>
        <button className="till__handle" onClick={() => setCartOpen(o => !o)}>
          {itemCount ? `${itemCount} item${itemCount > 1 ? 's' : ''} · ${kes(total)}` : 'Current sale'}
        </button>
        <div className="till__body">
          <div className={'till__lines' + (cart.length >= 5 ? ' till__lines--many' : '')}>
          <h2>Current sale</h2>
          {!cart.length && <p className="empty">Tap a product to add it. Quantities for kg items can be decimals.</p>}
          <ul className="lines">
            {cart.map(l => (
              <li key={l.id}>
                <div className="lines__name">{l.name}<small>{kes(l.price)} / {l.unit}</small></div>
                <input className="qty" inputMode="decimal" value={l.qty} onChange={e => setQty(l.id, e.target.value)} aria-label={`Quantity of ${l.name}`} />
                <div className="lines__sum">{kes(l.price * num(l.qty))}</div>
                <button className="x" onClick={() => remove(l.id)} aria-label={`Remove ${l.name}`}>×</button>
              </li>
            ))}
          </ul>

          </div>

          <div className="till__pay">
          <div className="till__top">
          <div className="total-row"><span>Total</span><strong>{kes(total)}</strong></div>

          <div className="seg" role="radiogroup" aria-label="Payment method">
            {[['cash', 'Cash'], ['mpesa', 'M-Pesa'], ['credit', 'Credit']].map(([v, label]) => (
              <button key={v} role="radio" aria-checked={method === v} className={method === v ? 'is-on' : ''} onClick={() => setMethod(v)}>{label}</button>
            ))}
          </div>

          </div>
          <div className="till__fields">
          <label className="field">{method === 'credit' ? 'Paid now (optional)' : method === 'mpesa' && mpOn && !mpManual ? 'Amount to request (leave blank for the full amount)' : 'Amount received'}
            <input inputMode="decimal" placeholder={method === 'credit' ? '0' : String(total || '')} value={received} onChange={e => setReceived(e.target.value)} />
          </label>
          {method === 'mpesa' && (mpOn && !mpManual ? (
            <div className="mpesa">
              {(!mp || ['failed', 'cancelled', 'timeout'].includes(mp.status)) && (
                <>
                  <label className="field">Customer's M-Pesa number
                    <input inputMode="tel" value={mpPhone} onChange={e => setMpPhone(e.target.value)} placeholder="0712 345 678" />
                  </label>
                  {mp && <div className="alert alert--warn">{mp.status === 'cancelled' ? 'The request was cancelled.' : mp.status === 'timeout' ? 'The customer did not respond in time.' : 'The payment did not go through.'}{mp.message ? ` ${mp.message}` : ''}</div>}
                  <button className="btn btn--primary" disabled={mpBusy || !cart.length || !mpPhone.trim()} onClick={requestMpesa}>
                    {mpBusy ? 'Sending request…' : mp ? 'Send request again' : `Send M-Pesa request${total ? ` · ${kes(Math.ceil(total))}` : ''}`}
                  </button>
                </>
              )}
              {mp?.status === 'pending' && (
                <div className="mpesa__wait" role="status">
                  <strong>Waiting for the customer</strong>
                  <span>Ask them to check their phone and enter their M-Pesa PIN for {kes(mp.amount)}.</span>
                  <button className="link" onClick={cancelWaiting}>Stop waiting</button>
                </div>
              )}
              {mp?.status === 'success' && (
                <div className="mpesa__ok" role="status">
                  <strong>Paid {kes(mp.paidAmount ?? mp.amount)} by M-Pesa</strong>
                  {mp.receipt && <span>Receipt {mp.receipt}</span>}
                  <span>Press Complete sale to finish.</span>
                </div>
              )}
              {(!mp || mp.status !== 'success') && mp?.status !== 'pending' && <button className="link" onClick={() => setMpManual(true)}>Enter the M-Pesa code instead</button>}
            </div>
          ) : (
            <>
              <label className="field">M-Pesa code
                <input value={mpesaCode} onChange={e => setMpesaCode(e.target.value.toUpperCase())} placeholder="e.g. SJK4T7XYZ1" />
              </label>
              {mpOn && <button className="link" onClick={() => setMpManual(false)}>Send an M-Pesa request instead</button>}
            </>
          ))}

          {(needsCustomer || customerId || attach) && (
            <div className="field">
              <label htmlFor="cust">Customer{needsCustomer ? ' (required)' : ''}</label>
              {!newCust ? (
                <div className="row">
                  <select id="cust" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                    <option value="">Choose a customer…</option>
                    {customers.map(c => <option key={c._id} value={c._id}>{c.name}{c.balance > 0 ? ` · owes ${kes(c.balance)}` : ''}</option>)}
                  </select>
                  <button className="btn btn--ghost" onClick={() => setNewCust({ name: '', phone: '' })}>New</button>
                </div>
              ) : (
                <div className="newcust">
                  <input placeholder="Customer name" value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} />
                  <input placeholder="Phone (optional)" value={newCust.phone} onChange={e => setNewCust({ ...newCust, phone: e.target.value })} />
                  <div className="row">
                    <button className="btn btn--primary" disabled={!newCust.name.trim()} onClick={addCustomer}>Save customer</button>
                    <button className="btn btn--ghost" onClick={() => setNewCust(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {!needsCustomer && !customerId && !attach && cart.length > 0 && (
            <button className="link" onClick={() => setAttach(true)}>Attach a customer to this sale</button>
          )}

          <div className="summary">
            {change > 0 && <div><span>Change to give</span><strong>{kes(change)}</strong></div>}
            {owed > 0 && <div className="owed"><span>Goes on the customer's account</span><strong>{kes(owed)}</strong></div>}
          </div>

          </div>
          <div className="till__foot">
          {error && <div className="alert alert--error" role="alert">{error}</div>}
          <button className="btn btn--primary btn--big" disabled={busy || !cart.length} onClick={checkout}>
            {busy ? 'Saving sale…' : `Complete sale · ${kes(total)}`}
          </button>
          {cart.length > 0 && <button className="link" onClick={() => { if (mp?.status === 'success' && !window.confirm(`The customer already paid ${kes(mp.paidAmount ?? mp.amount)} by M-Pesa. Clearing the sale leaves that payment unmatched. Clear anyway?`)) return; setCart([]); setMp(null); }}>Clear sale</button>}
          </div>
          </div>
        </div>
      </aside>

      {receipt && <Receipt sale={receipt} customerName={customerName} onNew={newSale} />}
    </div>
  );
}
