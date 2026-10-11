import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokenStore } from './api.js';
import { cache } from './offline.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);
const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(() => read('fl_biz'));
  const [loading, setLoading] = useState(!!tokenStore.get());

  const persist = useCallback(d => {
    if (d.token) tokenStore.set(d.token);
    localStorage.setItem('fl_user', JSON.stringify(d.user));
    localStorage.setItem('fl_biz', JSON.stringify(d.business));
    localStorage.setItem('fl_last_biz', d.business.code);
    setUser(d.user); setBusiness(d.business);
  }, []);

  useEffect(() => {
    if (!tokenStore.get()) return;
    api('/auth/me')
      .then(d => persist(d))
      .catch(e => {
        if (e.network) { const u = read('fl_user'); if (u) setUser(u); }   // offline: keep the till usable
        else tokenStore.clear();
      })
      .finally(() => setLoading(false));
  }, [persist]);

  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('fl-logout', out);
    return () => window.removeEventListener('fl-logout', out);
  }, []);

  const login = useCallback(async (code, username, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { business: code, username, password } });
    persist(d);
    return d.user;
  }, [persist]);
  const registerBusiness = useCallback(async body => {
    const d = await api('/auth/register-business', { method: 'POST', body });
    persist(d);
    return d;
  }, [persist]);
  const logout = useCallback(() => {
    tokenStore.clear(); localStorage.removeItem('fl_user'); localStorage.removeItem('fl_biz'); cache.clear();
    setUser(null); setBusiness(null);
  }, []);
  const refresh = useCallback(async () => persist(await api('/auth/me')), [persist]);

  return <AuthCtx.Provider value={{ user, business, loading, login, registerBusiness, logout, refresh }}>{children}</AuthCtx.Provider>;
}
