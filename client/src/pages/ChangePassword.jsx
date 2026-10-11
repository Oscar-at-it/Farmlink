import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function ChangePassword() {
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  if (!user) return <Navigate to="/login" replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== again) return setError('The new passwords do not match.');
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: cur, newPassword: next } });
      await refresh();
      nav('/', { replace: true });
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="login">
      <aside className="login__side">
        <h1>Set your own password.</h1>
        <p>The starting password was shared, so choose a new one before you record any sales.</p>
      </aside>
      <form className="login__form" onSubmit={submit}>
        <h2>Change password</h2>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <label>Current password<input type="password" value={cur} onChange={e => setCur(e.target.value)} required /></label>
        <label>New password<input type="password" value={next} onChange={e => setNext(e.target.value)} required /></label>
        <label>Repeat new password<input type="password" value={again} onChange={e => setAgain(e.target.value)} required /></label>
        <button className="btn btn--primary">Save password</button>
        <button type="button" className="btn btn--ghost" onClick={logout}>Log out</button>
      </form>
    </div>
  );
}
