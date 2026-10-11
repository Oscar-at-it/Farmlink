import { useEffect, useState } from 'react';
import { api, kes } from '../api.js';
import { localDate } from '../csv.js';
import BarChart from '../components/BarChart.jsx';

const PERIODS = [['today', 'Today'], ['week', 'Last 7 days'], ['month', 'Last 30 days']];
const METHOD = { cash: 'Cash', mpesa: 'M-Pesa', credit: 'Credit' };
const time = d => new Date(d).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });

function Change({ pct, label }) {
  if (pct === null || pct === undefined) return <small className="chg">No sales {label} to compare with</small>;
  return <small className={'chg ' + (pct >= 0 ? 'chg--up' : 'chg--down')}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}% vs {label}</small>;
}

export default function Dashboard() {
  const [period, setPeriod] = useState('today');
  const [day, setDay] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); setError('');
    const q = day ? `period=day&date=${day}` : `period=${period}`;
    api(`/dashboard?${q}`).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [period, day]);

  const single = data && data.series.length === 1;
  const prevLabel = day || period === 'today' ? 'the day before' : period === 'week' ? 'the previous 7 days' : 'the previous 30 days';
  const topProfit = Math.max(...(data?.topProducts || []).map(t => t.profit), 1);
  const payTotal = (data?.paymentMix || []).reduce((s, p) => s + p.total, 0) || 1;

  return (
    <div className="page">
      <div className="page__head">
        <h1>Dashboard</h1>
        <div className="head-tools">
          <div className="seg seg--auto" role="tablist">
            {PERIODS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={!day && period === k} className={!day && period === k ? 'is-on' : ''} onClick={() => { setDay(''); setPeriod(k); }}>{label}</button>
            ))}
          </div>
          <label className="check">or a day <input type="date" max={localDate()} value={day} onChange={e => setDay(e.target.value)} /></label>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {loading && !data && <p className="empty">Loading figures…</p>}

      {data && (
        <div className={loading ? 'is-loading' : ''}>
          <section className="figures">
            <div><span>Revenue</span><strong>{kes(data.summary.revenue)}</strong><Change pct={data.vsPrevious.revenuePct} label={prevLabel} /></div>
            <div><span>Profit</span><strong>{kes(data.summary.profit)}</strong><Change pct={data.vsPrevious.profitPct} label={prevLabel} /></div>
            <div><span>Margin</span><strong>{data.summary.margin}%</strong><small className="chg">of every shilling sold</small></div>
            <div><span>Sales</span><strong>{data.summary.sales}</strong><small className="chg">{data.summary.items} item lines</small></div>
          </section>

          {!single && (
            <section className="panel">
              <div className="panel__head">
                <h2>Revenue and profit by day</h2>
                <span className="legend"><i className="sw sw--rev" />Revenue <i className="sw sw--profit" />Profit</span>
              </div>
              <BarChart data={data.series} />
            </section>
          )}

          {data.summary.sales === 0 && <p className="empty">No sales in this period yet. Sales you record on the till appear here straight away.</p>}

          <div className="two">
            <section className="panel">
              <h2>Best earners</h2>
              {data.topProducts.length ? (
                <table className="tbl tbl--flat">
                  <thead><tr><th>Product</th><th className="r">Sold</th><th className="r">Profit</th></tr></thead>
                  <tbody>
                    {data.topProducts.map(t => (
                      <tr key={t.name}>
                        <td>{t.name}<span className="bar"><i style={{ width: `${(t.profit / topProfit) * 100}%` }} /></span></td>
                        <td className="r">{Math.round(t.qty * 100) / 100}</td>
                        <td className="r">{kes(t.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="empty">Nothing sold yet.</p>}
            </section>

            <section className="panel">
              <h2>How customers paid</h2>
              {data.paymentMix.length ? (
                <ul className="mix">
                  {data.paymentMix.map(p => (
                    <li key={p.method}>
                      <div><span>{METHOD[p.method] || p.method}</span><strong>{kes(p.total)}</strong></div>
                      <span className="bar"><i style={{ width: `${(p.total / payTotal) * 100}%` }} /></span>
                      <small>{p.count} sale{p.count === 1 ? '' : 's'} · {Math.round((p.total / payTotal) * 100)}%</small>
                    </li>
                  ))}
                </ul>
              ) : <p className="empty">No payments yet.</p>}
              <p className="hint">Credit counts the full value of the sale. Money still owed is on the Customers page.</p>
            </section>
          </div>

          {single && data.recent.length > 0 && (
            <section className="panel">
              <h2>Sales in the day</h2>
              <div className="tablewrap tablewrap--flat">
                <table className="tbl">
                  <thead><tr><th>Time</th><th>Receipt</th><th>Items</th><th>Paid by</th><th>Cashier</th><th className="r">Total</th><th className="r">Profit</th></tr></thead>
                  <tbody>
                    {data.recent.map(s => (
                      <tr key={s._id}>
                        <td>{time(s.createdAt)}</td><td>{s.receiptNo}</td>
                        <td>{s.items.map(i => `${i.productName} ×${i.qty}`).join(', ')}</td>
                        <td>{METHOD[s.payment.method]}</td><td>{s.soldBy?.fullName}</td>
                        <td className="r">{kes(s.totalRevenue)}</td><td className="r">{kes(s.totalProfit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
