import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Modal from '../components/Modal.jsx';

const ROLE = { admin: 'Admin', cashier: 'Cashier' };
const ACTION = {
  'product.create': 'Added a product', 'product.price_change': 'Changed a price or cost', 'product.deactivate': 'Removed a product',
  'sale.void': 'Voided a sale', 'stock.adjust': 'Adjusted stock', 'user.create': 'Added a user',
  'user.update': 'Changed a user', 'user.reset_password': 'Reset a password',
};
const when = d => new Date(d).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const tempPassword = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; return Array.from({ length: 10 }, () => c[Math.floor(Math.random() * c.length)]).join(''); };

function UserForm({ user, onClose, onSaved }) {
  const { business } = useAuth();
  const editing = !!user;
  const [f, setF] = useState({ username: user?.username || '', fullName: user?.fullName || '', role: user?.role || 'cashier', password: editing ? '' : tempPassword() });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!f.fullName.trim()) return setError('Enter the person\'s full name.');
    if (!editing && f.username.trim().length < 3) return setError('The username needs at least 3 characters.');
    if (!editing && f.password.length < 8) return setError('The temporary password needs at least 8 characters.');
    setBusy(true); setError('');
    try {
      if (editing) await api(`/auth/users/${user._id}`, { method: 'PATCH', body: { fullName: f.fullName.trim(), role: f.role } });
      else await api('/auth/users', { method: 'POST', body: { username: f.username.trim(), fullName: f.fullName.trim(), role: f.role, password: f.password } });
      onSaved(editing ? 'User updated.' : `${f.fullName.trim()} can now sign in with business code ${business?.code}, username ${f.username.trim().toLowerCase()} and the temporary password. They will choose their own at first sign-in.`);
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return (
    <Modal title={editing ? 'Edit user' : 'Add user'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {error && <div className="alert alert--error span2" role="alert">{error}</div>}
        <label className="span2">Full name<input value={f.fullName} onChange={e => set('fullName', e.target.value)} autoFocus /></label>
        <label>Username<input value={f.username} onChange={e => set('username', e.target.value)} disabled={editing} /></label>
        <label>Role
          <select value={f.role} onChange={e => set('role', e.target.value)}>
            <option value="cashier">Cashier: till and customers only</option>
            <option value="admin">Admin: everything, including costs and profit</option>
          </select>
        </label>
        {!editing && (
          <label className="span2">Temporary password
            <input value={f.password} onChange={e => set('password', e.target.value)} />
            <small className="hint">Give this to the user. They must replace it the first time they sign in.</small>
          </label>
        )}
        <footer className="span2">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add user'}</button>
        </footer>
      </form>
    </Modal>
  );
}

function ResetDialog({ user, onClose, onSaved }) {
  const [pw, setPw] = useState(tempPassword());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (pw.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    try { await api(`/auth/users/${user._id}/reset-password`, { method: 'POST', body: { newPassword: pw } }); onSaved(`Password reset for ${user.fullName}. Give them this temporary password: ${pw}`); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  return (
    <Modal title={`Reset password for ${user.fullName}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {error && <div className="alert alert--error span2">{error}</div>}
        <label className="span2">Temporary password<input value={pw} onChange={e => setPw(e.target.value)} autoFocus /></label>
        <p className="hint span2">They will be asked to choose their own password at next sign-in.</p>
        <footer className="span2">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</button>
        </footer>
      </form>
    </Modal>
  );
}

export default function Users() {
  const { user: me, business } = useAuth();
  const [tab, setTab] = useState('staff');
  const [users, setUsers] = useState([]);
  const [log, setLog] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setUsers((await api('/auth/users')).users); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'log') api('/audit').then(d => setLog(d.entries)).catch(e => setError(e.message)); }, [tab]);

  const done = msg => { setDialog(null); setNotice(msg); load(); };
  async function toggle(u) {
    try { await api(`/auth/users/${u._id}`, { method: 'PATCH', body: { isActive: !u.isActive } }); setNotice(u.isActive ? `${u.fullName} can no longer sign in.` : `${u.fullName} can sign in again.`); load(); }
    catch (e) { setError(e.message); }
  }
  const detail = d => d ? Object.entries(d).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ') : '';

  return (
    <div className="page">
      <div className="page__head">
        <h1>Users</h1>
        <button className="btn btn--primary" onClick={() => setDialog({ kind: 'form' })}>Add user</button>
      </div>
      <div className="tabs" role="tablist">
        {[['staff', 'Staff'], ['log', 'Activity log']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {notice && <div className="alert alert--ok">{notice}<button className="x" onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
      {error && <div className="alert alert--error">{error}</div>}

      {tab === 'staff' && (
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id} className={u.isActive ? '' : 'is-off'}>
                  <td>{u.fullName}{u._id === me._id && <span className="badge badge--low">You</span>}</td>
                  <td>{u.username}</td><td>{ROLE[u.role]}</td>
                  <td>{u.isActive ? (u.mustChangePassword ? 'Has not set own password yet' : 'Active') : 'Cannot sign in'}</td>
                  <td className="acts">
                    <button className="btn btn--sm btn--ghost" onClick={() => setDialog({ kind: 'form', user: u })}>Edit</button>
                    <button className="btn btn--sm btn--ghost" onClick={() => setDialog({ kind: 'reset', user: u })}>Reset password</button>
                    {u._id !== me._id && <button className="btn btn--sm btn--ghost" onClick={() => toggle(u)}>{u.isActive ? 'Deactivate' : 'Reactivate'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'log' && (
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
            <tbody>
              {log.map(l => <tr key={l._id}><td>{when(l.createdAt)}</td><td>{l.user?.fullName}</td><td>{ACTION[l.action] || l.action}</td><td>{detail(l.details)}</td></tr>)}
              {!log.length && <tr><td colSpan="4" className="empty">No activity recorded yet. Price changes, voids, stock adjustments and user changes appear here.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {dialog?.kind === 'form' && <UserForm user={dialog.user} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === 'reset' && <ResetDialog user={dialog.user} onClose={() => setDialog(null)} onSaved={done} />}
    </div>
  );
}
