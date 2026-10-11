import { useCallback, useEffect, useState } from 'react';
import { api, kes } from '../api.js';
import { useAuth } from '../auth.jsx';
import { CustomerForm, PaymentDialog, Statement } from '../components/CustomerDialogs.jsx';
import { ConfirmDialog } from '../components/StockDialogs.jsx';

export default function Customers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [totalOwed, setTotalOwed] = useState(0);
  const [search, setSearch] = useState('');
  const [debtorsOnly, setDebtorsOnly] = useState(false);
  const [dialog, setDialog] = useState(null);   // { kind, customer }
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (debtorsOnly) q.set('debtors', 'true');
      if (search.trim()) q.set('search', search.trim());
      const d = await api('/customers?' + q.toString());
      setCustomers(d.customers); setTotalOwed(d.totalOwed); setError('');
    } catch (e) { setError(e.message); }
  }, [search, debtorsOnly]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const done = msg => { setDialog(null); setNotice(msg); load(); };
  const close = () => setDialog(null);
  const owing = customers.filter(c => c.balance > 0);

  async function remove(c) {
    try { await api(`/customers/${c._id}`, { method: 'PATCH', body: { isActive: false } }); done(`${c.name} removed from the customer list.`); }
    catch (e) { setDialog(null); setError(e.message); }
  }

  return (
    <div className="page">
      <div className="page__head">
        <h1>Customers</h1>
        <button className="btn btn--primary" onClick={() => setDialog({ kind: 'form' })}>Add customer</button>
      </div>
      <p className="stats">
        <span><strong>{owing.length}</strong> customer{owing.length === 1 ? '' : 's'} owing</span>
        <span className={totalOwed > 0 ? 'is-warn' : ''}><strong>{kes(totalOwed)}</strong> owed to you in total</span>
      </p>

      <div className="filters">
        <input placeholder="Search by name or phone" value={search} onChange={e => setSearch(e.target.value)} />
        <label className="check"><input type="checkbox" checked={debtorsOnly} onChange={e => setDebtorsOnly(e.target.checked)} /> Only customers who owe</label>
      </div>
      {notice && <div className="alert alert--ok">{notice}<button className="x" onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="tablewrap">
        <table className="tbl">
          <thead><tr><th>Customer</th><th>Location</th><th className="r">Owes</th><th className="r">Credit limit</th><th></th></tr></thead>
          <tbody>
            {customers.map(c => {
              const over = c.creditLimit > 0 && c.balance > c.creditLimit;
              return (
                <tr key={c._id}>
                  <td>{c.name}{c.phone && <small style={{ marginLeft: 0 }}>{c.phone}</small>}</td>
                  <td>{c.location || ''}</td>
                  <td className={'r' + (c.balance > 0 ? ' is-warn' : '')}>{c.balance > 0 ? kes(c.balance) : '—'}{over && <span className="badge badge--out">Over limit</span>}</td>
                  <td className="r">{c.creditLimit > 0 ? kes(c.creditLimit) : 'No limit'}</td>
                  <td className="acts">
                    <button className="btn btn--sm" onClick={() => setDialog({ kind: 'statement', customer: c })}>Statement</button>
                    {c.balance > 0 && <button className="btn btn--sm" onClick={() => setDialog({ kind: 'pay', customer: c })}>Receive payment</button>}
                    <button className="btn btn--sm btn--ghost" onClick={() => setDialog({ kind: 'form', customer: c })}>Edit</button>
                    {user.role === 'admin' && c.balance <= 0 && <button className="btn btn--sm btn--ghost" onClick={() => setDialog({ kind: 'remove', customer: c })}>Remove</button>}
                  </td>
                </tr>
              );
            })}
            {!customers.length && <tr><td colSpan="5" className="empty">{search || debtorsOnly ? 'No customers match. Clear the search or the filter.' : 'No customers yet. Add one here, or while recording a credit sale on the till.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {dialog?.kind === 'form' && <CustomerForm customer={dialog.customer} onClose={close} onSaved={done} />}
      {dialog?.kind === 'pay' && <PaymentDialog customer={dialog.customer} onClose={close} onDone={done} />}
      {dialog?.kind === 'statement' && <Statement customerId={dialog.customer._id} onClose={close} onPay={c => setDialog({ kind: 'pay', customer: c })} />}
      {dialog?.kind === 'remove' && <ConfirmDialog title="Remove customer?" confirmLabel="Remove customer" onClose={close} onConfirm={() => remove(dialog.customer)}
        message={`${dialog.customer.name} will no longer appear in the customer list. Their past sales stay in your reports.`} />}
    </div>
  );
}
