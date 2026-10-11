import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Register() {
  const { user, registerBusiness } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ businessName: '', businessCode: '', ownerName: '', username: '', password: '', again: '', phone: '', email: '', starterCatalogue: false });
  const [codeEdited, setCodeEdited] = useState(false);
  const [codeState, setCodeState] = useState(null);    // { available, valid } for the code shown
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const timer = useRef();

  // Suggest a free business code from the name, and check the code live while the owner types
  useEffect(() => {
    clearTimeout(timer.current);
    if (!f.businessName.trim() && !f.businessCode) { setCodeState(null); return; }
    timer.current = setTimeout(async () => {
      try {
        if (!codeEdited) {
          const d = await api(`/auth/business-code?name=${encodeURIComponent(f.businessName)}`);
          setF(s => ({ ...s, businessCode: d.suggestion || d.code }));
          setCodeState({ available: true, valid: true });
        } else {
          const d = await api(`/auth/business-code?code=${encodeURIComponent(f.businessCode)}`);
          setCodeState({ available: d.available, valid: d.valid });
        }
      } catch { setCodeState(null); }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [f.businessName, f.businessCode, codeEdited]);

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (f.businessName.trim().length < 2) return setError('Enter your business name.');
    if (f.password.length < 8) return setError('The password must be at least 8 characters.');
    if (f.password !== f.again) return setError('The two passwords do not match.');
    if (codeState && !codeState.available) return setError('That business code is taken or not allowed. Choose another.');
    setBusy(true);
    try {
      await registerBusiness({
        businessName: f.businessName.trim(), businessCode: f.businessCode.trim() || undefined, ownerName: f.ownerName.trim(),
        username: f.username.trim(), password: f.password, phone: f.phone.trim() || undefined, email: f.email.trim() || undefined,
        starterCatalogue: f.starterCatalogue,
      });
      nav('/', { replace: true });
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <div className="login">
      <aside className="login__side">
        <h1>Run your agrovet from one place.</h1>
        <p>Sales, stock, credit and M-Pesa in one app. Your business gets its own private database, so nobody else can see your products, prices or customers.</p>
      </aside>
      <form className="login__form login__form--wide" onSubmit={submit}>
        <h2>Register your business</h2>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <label>Business name
          <input value={f.businessName} onChange={e => set('businessName', e.target.value)} placeholder="e.g. Mama Njeri Agrovet" autoFocus />
        </label>
        <label>Business code
          <input value={f.businessCode} onChange={e => { setCodeEdited(true); set('businessCode', e.target.value.toLowerCase()); }} autoCapitalize="none" autoCorrect="off" />
          <small className={'hint' + (codeState && !codeState.available ? ' hint--bad' : '')}>
            {codeState ? (codeState.available ? 'Available. ' : codeState.valid ? 'Already taken. ' : 'Use 3 to 30 letters, numbers or hyphens. ') : ''}
            You and your staff type this code, with a username and password, to sign in.
          </small>
        </label>
        <label>Your full name<input value={f.ownerName} onChange={e => set('ownerName', e.target.value)} autoComplete="name" /></label>
        <label>Username<input value={f.username} onChange={e => set('username', e.target.value.toLowerCase())} autoComplete="username" autoCapitalize="none" /></label>
        <div className="two">
          <label>Password<input type="password" value={f.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" /></label>
          <label>Repeat password<input type="password" value={f.again} onChange={e => set('again', e.target.value)} autoComplete="new-password" /></label>
        </div>
        <div className="two">
          <label>Phone (optional)<input inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} /></label>
          <label>Email (optional)<input type="email" value={f.email} onChange={e => set('email', e.target.value)} /></label>
        </div>
        <label className="check check--box">
          <input type="checkbox" checked={f.starterCatalogue} onChange={e => set('starterCatalogue', e.target.checked)} />
          <span>Start with a list of common agrovet products (fertilisers, seeds, feeds and more). Stock starts at 0 and you can edit or remove anything.</span>
        </label>
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Creating your business…' : 'Create my business'}</button>
        <p className="login__alt">Already registered? <Link to="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
