import { useEffect, useState } from 'react';
import { api, net } from './api.js';

const OUTBOX = 'fl_outbox';
const CACHE = 'fl_cache_';
const ping = name => window.dispatchEvent(new Event(name));
// Queued sales belong to one business. Another business signed in on the same device never sends or sees them.
export const currentBiz = () => { try { return JSON.parse(localStorage.getItem('fl_biz'))?.id || null; } catch { return null; } };
const mine = e => !e.biz || e.biz === currentBiz();
const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };

// ── Queue of sales recorded while offline ───────────────────────────────────
export const outbox = {
  all: () => read(OUTBOX, []),
  save(list) { localStorage.setItem(OUTBOX, JSON.stringify(list)); ping('fl-outbox'); },
  add(entry) { this.save([...this.all(), entry]); },
  remove(id) { this.save(this.all().filter(e => e.clientId !== id)); },
  update(id, patch) { this.save(this.all().map(e => (e.clientId === id ? { ...e, ...patch } : e))); },
};

// ── Last known data (products, customers) so the till opens without a connection ──
export const cache = {
  get: k => read(CACHE + k, null),
  set: (k, v) => { try { localStorage.setItem(CACHE + k, JSON.stringify(v)); } catch { /* storage full: ignore */ } },
  clear: () => Object.keys(localStorage).filter(k => k.startsWith(CACHE)).forEach(k => localStorage.removeItem(k)),
};

export async function cachedGet(path, key) {
  try {
    const data = await api(path);
    cache.set(key, data);
    return { data, stale: false };
  } catch (e) {
    const saved = e.network && cache.get(key);
    if (saved) return { data: saved, stale: true };
    throw e;
  }
}

export const newClientId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

// ── Send queued sales to the server, oldest first ───────────────────────────
let syncing = false;
export async function syncOutbox() {
  if (syncing) return;
  syncing = true; ping('fl-outbox');
  let sent = 0;
  try {
    for (const e of outbox.all().filter(x => x.status !== 'failed' && mine(x))) {
      try {
        await api('/sales', { method: 'POST', body: { items: e.items, customerId: e.customerId, payment: e.payment, clientId: e.clientId, soldAt: e.soldAt } });
        outbox.remove(e.clientId); sent++;
      } catch (err) {
        if (err.network || err.status === 401) break;                    // try again later
        if (/clientId/i.test(err.message)) { outbox.remove(e.clientId); continue; }   // already saved earlier
        outbox.update(e.clientId, { status: 'failed', error: err.message });          // needs a person to decide
      }
    }
  } finally {
    syncing = false;
    ping('fl-outbox');
    if (sent) ping('fl-synced');
  }
  return sent;
}
export const retrySale = id => { outbox.update(id, { status: 'waiting', error: undefined }); return syncOutbox(); };

// ── React hooks ─────────────────────────────────────────────────────────────
export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine && net.reachable);
  useEffect(() => {
    const f = () => setOnline(navigator.onLine && net.reachable);
    ['online', 'offline', 'fl-net'].forEach(ev => window.addEventListener(ev, f));
    return () => ['online', 'offline', 'fl-net'].forEach(ev => window.removeEventListener(ev, f));
  }, []);
  return online;
}
export function useOutbox() {
  const [list, setList] = useState(outbox.all().filter(mine));
  useEffect(() => {
    const f = () => setList(outbox.all().filter(mine));
    window.addEventListener('fl-outbox', f);
    return () => window.removeEventListener('fl-outbox', f);
  }, []);
  return list;
}
