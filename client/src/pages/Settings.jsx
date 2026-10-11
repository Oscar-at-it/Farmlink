import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Settings() {
  const { business, refresh } = useAuth();
  const [biz, setBiz] = useState({ name: business?.name || '', phone: business?.phone || '', address: business?.address || '' });
  const [bizMsg, setBizMsg] = useState('');
  const [bizErr, setBizErr] = useState('');

  const [mp, setMp] = useState(null);
  const [f, setF] = useState({ env: 'sandbox', consumerKey: '', consumerSecret: '', shortcode: '', passkey: '', transactionType: 'CustomerPayBillOnline', partyB: '' });
  const [callbackOk, setCallbackOk] = useState(true);
  const [mpMsg, setMpMsg] = useState('');
  const [mpErr, setMpErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadMp() {
    try {
      const d = await api('/settings/mpesa');
      setMp(d.settings); setCallbackOk(d.callbackBaseConfigured);
      setF(s => ({ ...s, env: d.settings.env, shortcode: d.settings.shortcode, transactionType: d.settings.transactionType, partyB: d.settings.partyB, consumerKey: '', consumerSecret: '', passkey: '' }));
    } catch (e) { setMpErr(e.message); }
  }
  useEffect(() => { loadMp(); }, []);

  async function saveBiz(e) {
    e.preventDefault(); setBizMsg(''); setBizErr('');
    try { await api('/business', { method: 'PATCH', body: biz }); await refresh(); setBizMsg('Business details saved. They now appear on receipts.'); }
    catch (err) { setBizErr(err.message); }
  }
  async function saveMp(e) {
    e.preventDefault(); setMpMsg(''); setMpErr(''); setBusy(true);
    try { await api('/settings/mpesa', { method: 'PUT', body: f }); setMpMsg('M-Pesa details saved. Cashiers can now send payment requests from the till.'); await loadMp(); }
    catch (err) { setMpErr(err.message); } finally { setBusy(false); }
  }
  async function removeMp() {
    if (!window.confirm('Turn off M-Pesa payment requests and delete the saved details? Cashiers can still type M-Pesa codes.')) return;
    try { await api('/settings/mpesa', { method: 'DELETE' }); setMpMsg('M-Pesa details removed.'); await loadMp(); } catch (err) { setMpErr(err.message); }
  }
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  return (
    <div className="page page--narrow">
      <div className="page__head"><h1>Settings</h1></div>

      <section className="panel">
        <h2>Your business</h2>
        <form className="form form--one" onSubmit={saveBiz}>
          {bizMsg && <div className="alert alert--ok">{bizMsg}</div>}
          {bizErr && <div className="alert alert--error">{bizErr}</div>}
          <label>Business code<input value={business?.code || ''} readOnly /><small className="hint">Your staff type this to sign in. It cannot be changed.</small></label>
          <label>Business name<input value={biz.name} onChange={e => setBiz({ ...biz, name: e.target.value })} /></label>
          <label>Phone shown on receipts<input value={biz.phone} onChange={e => setBiz({ ...biz, phone: e.target.value })} /></label>
          <label>Address shown on receipts<input value={biz.address} onChange={e => setBiz({ ...biz, address: e.target.value })} placeholder="Town, street or building" /></label>
          <footer><button className="btn btn--primary">Save business details</button></footer>
        </form>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>M-Pesa payment requests</h2>
          {mp && <span className={'badge ' + (mp.configured ? 'badge--ok' : 'badge--low')}>{mp.configured ? 'On' : 'Not set up'}</span>}
        </div>
        <p className="hint">Customers pay into <strong>your own</strong> Paybill or Till. Create an app on the Safaricom Daraja portal (developer.safaricom.co.ke), enable M-Pesa Express, and enter its details below. Secrets are stored encrypted and never shown again. Without this, cashiers can still type M-Pesa codes.</p>
        {!callbackOk && <div className="alert alert--warn">This server has no public callback address yet, so M-Pesa receipt numbers may not arrive. Payments are still confirmed by checking with Safaricom.</div>}
        <form className="form" onSubmit={saveMp}>
          {mpMsg && <div className="alert alert--ok span2">{mpMsg}</div>}
          {mpErr && <div className="alert alert--error span2">{mpErr}</div>}
          <label>Environment
            <select value={f.env} onChange={e => set('env', e.target.value)}>
              <option value="sandbox">Sandbox (testing, no real money)</option>
              <option value="production">Production (real payments)</option>
            </select>
          </label>
          <label>Money goes to a
            <select value={f.transactionType} onChange={e => set('transactionType', e.target.value)}>
              <option value="CustomerPayBillOnline">Paybill</option>
              <option value="CustomerBuyGoodsOnline">Till (Buy Goods)</option>
            </select>
          </label>
          <label>Consumer key<input value={f.consumerKey} onChange={e => set('consumerKey', e.target.value)} placeholder={mp?.consumerKeyHint ? `Saved ${mp.consumerKeyHint}. Leave blank to keep` : ''} autoComplete="off" /></label>
          <label>Consumer secret<input type="password" value={f.consumerSecret} onChange={e => set('consumerSecret', e.target.value)} placeholder={mp?.hasSecret ? 'Saved. Leave blank to keep' : ''} autoComplete="new-password" /></label>
          <label>{f.transactionType === 'CustomerBuyGoodsOnline' ? 'Head office / store number (shortcode)' : 'Paybill number (shortcode)'}<input inputMode="numeric" value={f.shortcode} onChange={e => set('shortcode', e.target.value)} /></label>
          <label>Passkey<input type="password" value={f.passkey} onChange={e => set('passkey', e.target.value)} placeholder={mp?.hasPasskey ? 'Saved. Leave blank to keep' : ''} autoComplete="new-password" /></label>
          {f.transactionType === 'CustomerBuyGoodsOnline' && <label className="span2">Till number<input inputMode="numeric" value={f.partyB} onChange={e => set('partyB', e.target.value)} /></label>}
          <footer className="span2">
            {mp?.configured && <button type="button" className="btn btn--ghost" onClick={removeMp}>Turn off and delete</button>}
            <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save M-Pesa details'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
