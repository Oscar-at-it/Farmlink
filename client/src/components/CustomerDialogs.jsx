import { useEffect, useState } from 'react';
import { api, kes } from '../api.js';
import Modal from './Modal.jsx';
import { useAuth } from '../auth.jsx';

const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : NaN; };
const dt = d => new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

// 0712 345 678 / +254712345678 / 712345678 -> 254712345678 for WhatsApp links
export function waNumber(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('254')) return d;
  if (d.startsWith('0')) return '254' + d.slice(1);
  if (d.length === 9) return '254' + d;
  return d;
}

export function CustomerForm({ customer, onClose, onSaved }) {
  const editing = !!customer;
  const [f, setF] = useState({ name: customer?.name || '', phone: customer?.phone || '', location: customer?.location || '', creditLimit: customer?.creditLimit ?? 0 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return setError('Enter the customer\'s name.');
    if (f.phone.trim() && f.phone.trim().length < 7) return setError('The phone number looks too short.');
    if (Number.isNaN(n(f.creditLimit)) || n(f.creditLimit) < 0) return setError('Credit limit must be 0 or more.');
    setBusy(true); setError('');
    const body = { name: f.name.trim(), phone: f.phone.trim() || undefined, location: f.location.trim() || undefined, creditLimit: n(f.creditLimit) };
    try {
      await api(editing ? `/customers/${customer._id}` : '/customers', { method: editing ? 'PATCH' : 'POST', body });
      onSaved(editing ? 'Customer updated.' : 'Customer added.');
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return (
    <Modal title={editing ? 'Edit customer' : 'Add customer'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {error && <div className="alert alert--error span2" role="alert">{error}</div>}
        <label className="span2">Name<input value={f.name} onChange={e => set('name', e.target.value)} autoFocus /></label>
        <label>Phone<input value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="0712 345 678" /></label>
        <label>Location<input value={f.location} onChange={e => set('location', e.target.value)} placeholder="Village or town" /></label>
        <label className="span2">Credit limit (KSh)
          <input inputMode="decimal" value={f.creditLimit} onChange={e => set('creditLimit', e.target.value)} />
          <small className="hint">The most this customer can owe at one time. Use 0 for no limit.</small>
        </label>
        <footer className="span2">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add customer'}</button>
        </footer>
      </form>
    </Modal>
  );
}

export function PaymentDialog({ customer, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!(n(amount) > 0)) return setError('Enter the amount received.');
    if (n(amount) > customer.balance) return setError(`That is more than the ${kes(customer.balance)} owed.`);
    if (method === 'mpesa' && !code.trim()) return setError('Enter the M-Pesa transaction code.');
    setBusy(true); setError('');
    try {
      const d = await api(`/customers/${customer._id}/payments`, { method: 'POST', body: { amount: n(amount), method, mpesaCode: code.trim() || undefined } });
      onDone(d.balance > 0 ? `Payment saved. ${customer.name} still owes ${kes(d.balance)}.` : `Payment saved. ${customer.name} has cleared the account.`);
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return (
    <Modal title={`Payment from ${customer.name}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="hint span2">Owes <strong>{kes(customer.balance)}</strong></p>
        {error && <div className="alert alert--error span2" role="alert">{error}</div>}
        <label>Amount received
          <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
          <button type="button" className="link" onClick={() => setAmount(String(customer.balance))}>Pay in full</button>
        </label>
        <div className="field">Paid by
          <div className="seg" style={{ gridTemplateColumns: 'repeat(2,1fr)' }} role="radiogroup" aria-label="Payment method">
            {[['cash', 'Cash'], ['mpesa', 'M-Pesa']].map(([v, l]) => <button type="button" key={v} role="radio" aria-checked={method === v} className={method === v ? 'is-on' : ''} onClick={() => setMethod(v)}>{l}</button>)}
          </div>
        </div>
        {method === 'mpesa' && <label className="span2">M-Pesa code<input value={code} onChange={e => setCode(e.target.value.toUpperCase())} /></label>}
        <footer className="span2">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</button>
        </footer>
      </form>
    </Modal>
  );
}

export function Statement({ customerId, onClose, onPay }) {
  const { business } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/customers/${customerId}`).then(setD).catch(e => setError(e.message)); }, [customerId]);

  const entries = d ? [
    ...d.sales.filter(s => s.status === 'completed').map(s => ({ at: s.createdAt, text: `Sale ${s.receiptNo}`, sub: `Total ${kes(s.totalRevenue)}, paid ${kes(s.payment.amountPaid)}`, charge: s.payment.balanceOwed, pay: 0 })),
    ...d.payments.map(p => ({ at: p.createdAt, text: `Payment (${p.method === 'mpesa' ? 'M-Pesa' : 'cash'})`, sub: p.mpesaCode || '', charge: 0, pay: p.amount })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)) : [];

  const c = d?.customer;
  const reminder = c && c.phone && c.balance > 0
    ? `https://wa.me/${waNumber(c.phone)}?text=${encodeURIComponent(`Hello ${c.name}, this is a friendly reminder from ${business?.name || 'our shop'} that your account balance is ${kes(c.balance)}. Thank you for your business.`)}`
    : null;

  return (
    <Modal title={c ? c.name : 'Statement'} onClose={onClose} wide>
      {error && <div className="alert alert--error" style={{ margin: '1rem' }}>{error}</div>}
      {!d && !error && <p className="empty" style={{ padding: '1rem' }}>Loading statement…</p>}
      {c && (
        <div className="statement" id="statement">
          <div className="statement__top">
            <div>
              <p className="hint">{[c.phone, c.location].filter(Boolean).join(' · ') || 'No phone or location saved'}</p>
              <p className="statement__bal"><span>Balance owed</span><strong className={c.balance > 0 ? 'is-warn' : ''}>{kes(c.balance)}</strong></p>
              {c.creditLimit > 0 && <p className="hint">Credit limit {kes(c.creditLimit)}{c.balance > c.creditLimit ? ' · over the limit' : ''}</p>}
            </div>
            <div className="statement__acts">
              {c.balance > 0 && <button className="btn btn--primary" onClick={() => onPay(c)}>Receive payment</button>}
              {reminder && <a className="btn btn--ghost" href={reminder} target="_blank" rel="noreferrer">Send WhatsApp reminder</a>}
              <button className="btn btn--ghost" onClick={() => window.print()}>Print statement</button>
            </div>
          </div>
          <table className="tbl tbl--flat">
            <thead><tr><th>Date</th><th>What happened</th><th className="r">Added to account</th><th className="r">Paid off</th></tr></thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td>{dt(e.at)}</td><td>{e.text}{e.sub && <small style={{ marginLeft: 0 }}>{e.sub}</small>}</td>
                  <td className="r">{e.charge > 0 ? kes(e.charge) : ''}</td><td className="r pos">{e.pay > 0 ? kes(e.pay) : ''}</td>
                </tr>
              ))}
              {!entries.length && <tr><td colSpan="4" className="empty">No credit sales or payments yet.</td></tr>}
            </tbody>
          </table>
          <p className="hint">Shows the latest 50 sales and 50 payments.</p>
        </div>
      )}
    </Modal>
  );
}
