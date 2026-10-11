import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import Product from '../models/Product.js';
import MpesaPayment from '../models/MpesaPayment.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { normalizePhone, safeEqual, stkPush, stkQuery } from '../config/mpesa.js';
import { getMpesaConfig } from '../services/mpesaConfig.js';
import { ctxOf, runWithTenant } from '../tenancy/context.js';
import { getBusiness } from '../services/tenants.js';

const r = Router();
const PENDING_TIMEOUT_MS = 3 * 60 * 1000;

const view = p => ({
  id: p._id, status: p.status, amount: p.amount, paidAmount: p.paidAmount, receipt: p.mpesaReceipt,
  message: p.resultDesc, used: p.used, createdAt: p.createdAt,
});
const statusFor = code => (code === 0 ? 'success' : code === 1032 ? 'cancelled' : code === 1037 ? 'timeout' : 'failed');

// Applies an outcome once. The status: 'pending' condition makes callback and query safe to race.
async function applyResult(filter, { resultCode, resultDesc, receipt, date, amount, raw, fromCallback }) {
  const set = { status: statusFor(resultCode), resultCode, resultDesc };
  if (receipt) set.mpesaReceipt = receipt;
  if (date) set.transactionDate = date;
  if (resultCode === 0 && amount !== undefined) set.paidAmount = Number(amount);
  if (fromCallback) { set.callbackAt = new Date(); set.rawCallback = raw; }
  return MpesaPayment.findOneAndUpdate({ ...filter, status: 'pending' }, { $set: set }, { new: true });
}

r.get('/config', requireAuth, asyncHandler(async (_req, res) => {
  const cfg = await getMpesaConfig();
  res.json({ ok: true, enabled: !!cfg, env: cfg?.env || null });
}));

// ── Ask the customer to pay: the amount is computed here from the cart, never trusted from the client ──
const stkBody = z.object({
  items: z.array(z.object({ productId: z.string().min(1), qty: z.coerce.number().positive() })).min(1),
  phone: z.string().min(9),
  amount: z.coerce.number().positive().optional(),     // optional smaller amount for part payments
});
r.post('/stk', requireAuth, rateLimit({ windowMs: 60 * 1000, max: 20 }), validate(stkBody), asyncHandler(async (req, res) => {
  const cfg = await getMpesaConfig();
  if (!cfg) throw new HttpError(503, 'M-Pesa payments are not set up for this business. An administrator can add the details under Settings.');
  const phone = normalizePhone(req.body.phone);
  if (!phone) throw new HttpError(400, 'Enter a Safaricom number such as 0712 345 678.');

  const wanted = new Map();
  for (const i of req.body.items) wanted.set(i.productId, (wanted.get(i.productId) || 0) + i.qty);
  const products = await Product.find({ _id: { $in: [...wanted.keys()] }, isActive: true });
  if (products.length !== wanted.size) throw new HttpError(400, 'One or more products no longer exist');
  const total = Math.ceil(products.reduce((s, p) => s + p.price * wanted.get(String(p._id)), 0));   // STK Push takes whole shillings
  const amount = req.body.amount ? Math.ceil(req.body.amount) : total;
  if (amount < 1 || amount > total) throw new HttpError(400, `The amount must be between 1 and ${total}.`);

  const callbackBase = process.env.MPESA_CALLBACK_BASE_URL;
  const callbackUrl = callbackBase
    ? `${callbackBase.replace(/\/$/, '')}/api/mpesa/callback/${req.business._id}/${cfg.callbackSecret}`   // business id lets the public callback find the right database
    : 'https://example.com/api/mpesa/callback';      // no public URL (local testing): the status check below asks M-Pesa instead
  const resp = await stkPush(cfg, { phone, amount, callbackUrl });

  const p = await MpesaPayment.create({
    checkoutRequestId: resp.CheckoutRequestID, merchantRequestId: resp.MerchantRequestID, phone, amount, createdBy: req.user._id,
  });
  res.status(201).json({ ok: true, payment: view(p), message: resp.CustomerMessage || 'Ask the customer to enter their M-Pesa PIN.' });
}));

// ── Poll for the outcome ────────────────────────────────────────────────────
r.get('/status/:id', requireAuth, asyncHandler(async (req, res) => {
  let p = await MpesaPayment.findById(req.params.id);
  if (!p) throw new HttpError(404, 'Payment not found');
  if (req.user.role !== 'admin' && String(p.createdBy) !== String(req.user._id)) throw new HttpError(403, 'Not your payment');

  if (p.status === 'pending') {
    const age = Date.now() - p.createdAt.getTime();
    const sinceQuery = p.lastQueryAt ? Date.now() - p.lastQueryAt.getTime() : Infinity;
    if (age > 15000 && sinceQuery > 8000) {          // callback has not arrived: ask M-Pesa directly
      await MpesaPayment.updateOne({ _id: p._id }, { lastQueryAt: new Date() });
      try {
        const cfg = await getMpesaConfig();
        const q = cfg ? await stkQuery(cfg, p.checkoutRequestId) : { pending: true };
        if (!q.pending) p = (await applyResult({ _id: p._id }, q)) || (await MpesaPayment.findById(p._id));
      } catch { /* keep waiting; try again on the next poll */ }
    }
    if (p.status === 'pending' && age > PENDING_TIMEOUT_MS)
      p = (await applyResult({ _id: p._id }, { resultCode: 1037, resultDesc: 'No response from the customer' })) || (await MpesaPayment.findById(p._id));
  }
  res.json({ ok: true, payment: view(p) });
}));

// ── Safaricom calls this. Daraja does not sign callbacks, so the URL carries the business id and that business's own secret, and the payment must already exist. ──
r.post('/callback/:biz/:secret', async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  try {
    const business = await getBusiness(req.params.biz);
    if (!business || business.status !== 'active') return;
    const cb = req.body?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) return;
    await runWithTenant(ctxOf(business), async () => {
      const cfg = await getMpesaConfig();                       // the secret belongs to this business
      if (!cfg?.callbackSecret || !safeEqual(req.params.secret, cfg.callbackSecret)) return;
      const meta = cb.CallbackMetadata?.Item || [];
      const get = name => meta.find(i => i.Name === name)?.Value;
      await applyResult({ checkoutRequestId: cb.CheckoutRequestID }, {
        resultCode: Number(cb.ResultCode), resultDesc: cb.ResultDesc,
        receipt: get('MpesaReceiptNumber'), date: get('TransactionDate') !== undefined ? String(get('TransactionDate')) : undefined,
        amount: get('Amount'), raw: req.body, fromCallback: true,
      });
    });
  } catch (e) { console.error('M-Pesa callback error:', e.message); }
});

// ── Reconciliation list (admin) ─────────────────────────────────────────────
r.get('/payments', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const list = await MpesaPayment.find().sort('-createdAt').limit(200).populate('createdBy', 'fullName').populate('sale', 'receiptNo status');
  res.json({ ok: true, payments: list.map(p => ({
    id: p._id, createdAt: p.createdAt, phone: `${p.phone.slice(0, 5)}•••${p.phone.slice(-3)}`, amount: p.amount, paidAmount: p.paidAmount,
    status: p.status, receipt: p.mpesaReceipt, message: p.resultDesc, cashier: p.createdBy?.fullName, sale: p.sale ? { receiptNo: p.sale.receiptNo, status: p.sale.status } : null, used: p.used,
  })) });
}));
export default r;
