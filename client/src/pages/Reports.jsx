import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api, kes } from '../api.js';
import { downloadCsv, localDate } from '../csv.js';
import Modal from '../components/Modal.jsx';

const METHOD = { cash: 'Cash', mpesa: 'M-Pesa', credit: 'Credit' };
const when = d => new Date(d).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const daysAgo = n => localDate(new Date(Date.now() - n * 864e5));

function VoidDialog({ sale, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (reason.trim().length < 3) return setError('Give a short reason, for example "wrong item" or "customer returned goods".');
    setBusy(true);
    try { await api(`/sales/${sale._id}/void`, { method: 'POST', body: { reason: reason.trim() } }); onDone(`Receipt ${sale.receiptNo} voided. Stock was put back.`); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  return (
    <Modal title={`Void receipt ${sale.receiptNo}?`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="span2">This puts {sale.items.length} item line{sale.items.length === 1 ? '' : 's'} back in stock{sale.payment.balanceOwed > 0 ? ` and removes ${kes(sale.payment.balanceOwed)} from the customer's account` : ''}. The sale stays in the records, marked as voided. You can't undo this.</p>
        {sale.payment.method === 'mpesa' && <div className="alert alert--warn span2">This sale was paid by M-Pesa. Voiding does not send the money back to the customer. Refund it separately.</div>}
        {error && <div className="alert alert--error span2" role="alert">{error}</div>}
        <label className="span2">Reason<input value={reason} onChange={e => setReason(e.target.value)} autoFocus /></label>
        <footer className="span2">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Keep sale</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Voiding…' : 'Void sale'}</button>
        </footer>
      </form>
    </Modal>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('sales');
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(localDate());
  const [sales, setSales] = useState([]);
  const [open, setOpen] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deadDays, setDeadDays] = useState(30);
  const [dead, setDead] = useState([]);
  const [mpesa, setMpesa] = useState([]);

  const load = useCallback(async () => {
    if (from > to) return setError('The start date must be on or before the end date.');
    setLoading(true); setError('');
    try { setSales((await api(`/sales?from=${from}&to=${to}&limit=500`)).sales); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'mpesa') api('/mpesa/payments').then(d => setMpesa(d.payments)).catch(e => setError(e.message)); }, [tab]);
  useEffect(() => { if (tab === 'dead') api(`/dashboard/dead-stock?days=${deadDays}`).then(d => setDead(d.items)).catch(e => setError(e.message)); }, [tab, deadDays]);

  const totals = useMemo(() => {
    const ok = sales.filter(s => s.status === 'completed');
    return { n: ok.length, revenue: ok.reduce((a, s) => a + s.totalRevenue, 0), profit: ok.reduce((a, s) => a + s.totalProfit, 0), owed: ok.reduce((a, s) => a + s.payment.balanceOwed, 0), voided: sales.length - ok.length };
  }, [sales]);

  const cust = s => s.customer?.name || '';
  function exportSales() {
    downloadCsv(`sales_${from}_to_${to}.csv`,
      ['Receipt', 'Date', 'Cashier', 'Customer', 'Payment', 'M-Pesa code', 'Total', 'Profit', 'Balance owed', 'Status'],
      sales.map(s => [s.receiptNo, new Date(s.createdAt).toLocaleString('en-KE'), s.soldBy?.fullName, cust(s), METHOD[s.payment.method], s.payment.mpesaCode, s.totalRevenue, s.totalProfit, s.payment.balanceOwed, s.status]));
  }
  function exportLines() {
    downloadCsv(`sale_lines_${from}_to_${to}.csv`,
      ['Receipt', 'Date', 'Product', 'Quantity', 'Unit', 'Unit price', 'Unit cost', 'Revenue', 'Profit', 'Status'],
      sales.flatMap(s => s.items.map(i => [s.receiptNo, new Date(s.createdAt).toLocaleString('en-KE'), i.productName, i.qty, i.unit, i.unitPrice, i.unitCost, i.lineRevenue, i.lineProfit, s.status])));
  }

  return (
    <div className="page">
      <div className="page__head"><h1>Reports</h1></div>
      <div className="tabs" role="tablist">
        {[['sales', 'Sales'], ['mpesa', 'M-Pesa payments'], ['dead', 'Not selling']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {notice && <div className="alert alert--ok">{notice}<button className="x" onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
      {error && <div className="alert alert--error">{error}</div>}

      {tab === 'sales' && (
        <>
          <div className="filters">
            <label className="check">From <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
            <label className="check">To <input type="date" value={to} max={localDate()} onChange={e => setTo(e.target.value)} /></label>
            <button className="btn btn--sm btn--ghost" onClick={() => { setFrom(localDate()); setTo(localDate()); }}>Today</button>
            <button className="btn btn--sm btn--ghost" onClick={() => { setFrom(daysAgo(6)); setTo(localDate()); }}>Last 7 days</button>
            <button className="btn btn--sm btn--ghost" onClick={() => { setFrom(daysAgo(29)); setTo(localDate()); }}>Last 30 days</button>
            <span className="grow" />
            <button className="btn btn--sm" disabled={!sales.length} onClick={exportSales}>Export sales (CSV)</button>
            <button className="btn btn--sm" disabled={!sales.length} onClick={exportLines}>Export item lines (CSV)</button>
          </div>

          <p className="stats">
            <span><strong>{totals.n}</strong> sales</span>
            <span><strong>{kes(totals.revenue)}</strong> revenue</span>
            <span><strong>{kes(totals.profit)}</strong> profit</span>
            {totals.owed > 0 && <span className="is-warn"><strong>{kes(totals.owed)}</strong> sold on credit</span>}
            {totals.voided > 0 && <span><strong>{totals.voided}</strong> voided (not counted)</span>}
          </p>
          {sales.length >= 500 && <div className="alert alert--warn">Showing the latest 500 sales. Narrow the dates to see the rest.</div>}

          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Receipt</th><th>Date</th><th>Cashier</th><th>Customer</th><th>Paid by</th><th className="r">Total</th><th className="r">Profit</th><th></th></tr></thead>
              <tbody>
                {sales.map(s => (
                  <Fragment key={s._id}>
                    <tr className={'clickable' + (s.status === 'voided' ? ' is-off' : '')} onClick={() => setOpen(open === s._id ? null : s._id)}>
                      <td>{s.receiptNo}{s.status === 'voided' && <span className="badge badge--out">Voided</span>}</td>
                      <td>{when(s.createdAt)}</td><td>{s.soldBy?.fullName}</td><td>{cust(s)}</td><td>{METHOD[s.payment.method]}</td>
                      <td className="r">{kes(s.totalRevenue)}</td><td className="r">{kes(s.totalProfit)}</td>
                      <td className="acts">{s.status === 'completed' && <button className="btn btn--sm btn--ghost" onClick={e => { e.stopPropagation(); setVoiding(s); }}>Void</button>}</td>
                    </tr>
                    {open === s._id && (
                      <tr className="detail"><td colSpan="8">
                        <ul>{s.items.map((i, k) => <li key={k}><span>{i.productName}<small> {i.qty} {i.unit} × {kes(i.unitPrice)}</small></span><span>{kes(i.lineRevenue)}</span></li>)}</ul>
                        {s.payment.balanceOwed > 0 && <p className="hint">Paid {kes(s.payment.amountPaid)}, {kes(s.payment.balanceOwed)} put on the customer's account.</p>}
                        {s.payment.mpesaCode && <p className="hint">M-Pesa code {s.payment.mpesaCode}</p>}
                        {s.status === 'voided' && <p className="hint">Voided: {s.voidReason}</p>}
                      </td></tr>
                    )}
                  </Fragment>
                ))}
                {!sales.length && !loading && <tr><td colSpan="8" className="empty">No sales between these dates. Try a wider range.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'mpesa' && (
        <>
          <p className="stats">
            <span><strong>{mpesa.filter(p => p.status === 'success').length}</strong> paid</span>
            <span className={mpesa.some(p => p.status === 'success' && !p.sale) ? 'is-warn' : ''}><strong>{mpesa.filter(p => p.status === 'success' && !p.sale).length}</strong> paid with no sale recorded</span>
            <span><strong>{mpesa.filter(p => ['failed', 'cancelled', 'timeout'].includes(p.status)).length}</strong> not completed</span>
          </p>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>When</th><th>Customer phone</th><th className="r">Requested</th><th className="r">Paid</th><th>Status</th><th>M-Pesa receipt</th><th>Cashier</th><th>Sale</th></tr></thead>
              <tbody>
                {mpesa.map(p => (
                  <tr key={p.id} className={p.status === 'success' && !p.sale ? 'flag' : ''}>
                    <td>{when(p.createdAt)}</td><td>{p.phone}</td><td className="r">{kes(p.amount)}</td><td className="r">{p.paidAmount ? kes(p.paidAmount) : ''}</td>
                    <td><span className={'badge ' + (p.status === 'success' ? 'badge--ok' : p.status === 'pending' ? 'badge--low' : 'badge--out')}>{{ success: 'Paid', pending: 'Waiting', failed: 'Failed', cancelled: 'Cancelled', timeout: 'No response' }[p.status]}</span></td>
                    <td>{p.receipt || ''}</td><td>{p.cashier}</td>
                    <td>{p.sale ? p.sale.receiptNo : p.status === 'success' ? 'Money received, no sale' : ''}</td>
                  </tr>
                ))}
                {!mpesa.length && <tr><td colSpan="8" className="empty">No M-Pesa requests yet. They appear here when a cashier sends a payment request from the till.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="hint">A paid row with no sale means the customer paid but the sale was not completed, for example after Clear sale. Check with the cashier and record the sale or refund the customer.</p>
        </>
      )}

      {tab === 'dead' && (
        <>
          <div className="filters">
            <label className="check">Products with stock that have not sold in
              <select value={deadDays} onChange={e => setDeadDays(Number(e.target.value))}>
                {[14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
              </select>
            </label>
            <span className="grow" />
            <span className="stats"><span><strong>{kes(dead.reduce((s, p) => s + p.cost * p.stockQty, 0))}</strong> tied up at cost</span></span>
          </div>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Product</th><th className="r">In stock</th><th className="r">Value at cost</th></tr></thead>
              <tbody>
                {dead.map(p => <tr key={p._id}><td>{p.name}</td><td className="r">{p.stockQty} {p.unit}</td><td className="r">{kes(p.cost * p.stockQty)}</td></tr>)}
                {!dead.length && <tr><td colSpan="3" className="empty">Everything in stock has sold in the last {deadDays} days.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {voiding && <VoidDialog sale={voiding} onClose={() => setVoiding(null)} onDone={m => { setVoiding(null); setNotice(m); load(); }} />}
    </div>
  );
}
