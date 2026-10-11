const KEY = 'fl_token';
export const tokenStore = {
  get: () => localStorage.getItem(KEY),
  set: t => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
};

// Tracks whether the last request reached the server, so the app can show "Offline"
export const net = { reachable: true };
const setReachable = ok => {
  if (net.reachable !== ok) { net.reachable = ok; window.dispatchEvent(new Event('fl-net')); }
};

export async function api(path, { method = 'GET', body } = {}) {
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    setReachable(false);
    throw Object.assign(new Error('You are offline. This needs an internet connection.'), { network: true });
  }
  setReachable(true);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') {
    tokenStore.clear();
    window.dispatchEvent(new Event('fl-logout'));
  }
  if (!res.ok || data.ok === false) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}

export const kes = n => 'KSh ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
