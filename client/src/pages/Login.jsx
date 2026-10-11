import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [code, setCode] = useState(() => localStorage.getItem('fl_last_biz') || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user && !user.mustChangePassword) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const u = await login(code.trim(), username.trim(), password);
      nav(u.mustChangePassword ? '/change-password' : '/', { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="login">
      <aside className="login__side">
        <h1>See what every sale earns you.</h1>
        <p>Record sales, watch stock, and track who owes you. Every agrovet gets its own private space.</p>
      </aside>
      <form className="login__form" onSubmit={submit}>
        <h2>Sign in</h2>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <label>Business code
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. mama-njeri-agrovet" autoCapitalize="none" autoCorrect="off" autoFocus={!code} required />
        </label>
        <label>Username
          <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoFocus={!!code} required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="login__alt">New agrovet? <Link to="/register">Register your business</Link></p>
      </form>
    </div>
  );
}
