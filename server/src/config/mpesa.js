import crypto from 'node:crypto';
import { HttpError } from '../middleware/error.js';

// Safaricom Daraja: M-Pesa Express (STK Push). Docs: https://developer.safaricom.co.ke
// Every function takes the business's own settings (cfg), because each agrovet receives payments into its own Paybill or Till.
const BASES = { sandbox: 'https://sandbox.safaricom.co.ke', production: 'https://api.safaricom.co.ke' };
const base = cfg => (cfg.env === 'production' ? BASES.production : BASES.sandbox);

// 0712 345 678, +254712345678, 712345678  ->  254712345678  (null if not a Safaricom-style number)
export function normalizePhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  const n = d.startsWith('254') ? d : d.startsWith('0') ? '254' + d.slice(1) : d.length === 9 ? '254' + d : d;
  return /^254[17]\d{8}$/.test(n) ? n : null;
}

// Daraja wants YYYYMMDDHHmmss in East Africa Time
const timestamp = () => new Date(Date.now() + 3 * 3600e3).toISOString().replace(/[-:T]/g, '').slice(0, 14);

const tokens = new Map();   // one cached token per consumer key
async function accessToken(cfg) {
  const k = `${cfg.env}:${cfg.consumerKey}`;
  const hit = tokens.get(k);
  if (hit && Date.now() < hit.exp) return hit.value;
  const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString('base64');
  let res;
  try { res = await fetch(`${base(cfg)}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } }); }
  catch { throw new HttpError(503, 'Could not reach M-Pesa. Check the internet connection.'); }
  if (!res.ok) throw new HttpError(502, 'M-Pesa refused the sign-in. Check the consumer key and secret in Settings.');
  const j = await res.json();
  const value = j.access_token;
  tokens.set(k, { value, exp: Date.now() + ((Number(j.expires_in) || 3599) - 60) * 1000 });
  return value;
}

function credentials(cfg) {
  const ts = timestamp();
  return { shortcode: cfg.shortcode, ts, password: Buffer.from(cfg.shortcode + cfg.passkey + ts).toString('base64') };
}

async function call(cfg, path, body) {
  const token = await accessToken(cfg);
  let res;
  try {
    res = await fetch(base(cfg) + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new HttpError(503, 'Could not reach M-Pesa. Check the internet connection.'); }
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

export async function stkPush(cfg, { phone, amount, callbackUrl }) {
  const { shortcode, ts, password } = credentials(cfg);
  const { ok, json } = await call(cfg, '/mpesa/stkpush/v1/processrequest', {
    BusinessShortCode: shortcode, Password: password, Timestamp: ts,
    TransactionType: cfg.transactionType || 'CustomerPayBillOnline',   // 'CustomerBuyGoodsOnline' for a Till
    Amount: amount, PartyA: phone, PartyB: cfg.partyB || shortcode, PhoneNumber: phone,
    CallBackURL: callbackUrl, AccountReference: 'FARMLINK', TransactionDesc: 'Shop payment',
  });
  if (!ok || String(json.ResponseCode) !== '0')
    throw new HttpError(502, json.errorMessage || json.ResponseDescription || 'M-Pesa did not accept the request. Check the phone number and try again.');
  return json;   // MerchantRequestID, CheckoutRequestID, CustomerMessage
}

// Returns { pending: true } while M-Pesa is still processing, otherwise { resultCode, resultDesc }
export async function stkQuery(cfg, checkoutRequestId) {
  const { shortcode, ts, password } = credentials(cfg);
  const { json } = await call(cfg, '/mpesa/stkpushquery/v1/query', { BusinessShortCode: shortcode, Password: password, Timestamp: ts, CheckoutRequestID: checkoutRequestId });
  if (json.ResultCode === undefined || json.ResultCode === null) return { pending: true };
  return { resultCode: Number(json.ResultCode), resultDesc: json.ResultDesc };
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
