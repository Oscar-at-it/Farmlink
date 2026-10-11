import { Router } from 'express';
import { z } from 'zod';
import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import StockMovement from '../models/StockMovement.js';
import MpesaPayment from '../models/MpesaPayment.js';
import { nextReceiptNo } from '../models/Counter.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { deductStock, restoreStock, logMovements } from '../services/stock.js';
import { audit } from '../services/audit.js';

const r = Router();
r.use(requireAuth);
const money = n => Math.round(n * 100) / 100;

const saleBody = z.object({
  items: z.array(z.object({ productId: z.string().min(1), qty: z.coerce.number().positive() })).min(1),
  customerId: z.string().optional(),
  clientId: z.string().min(8).max(80).optional(),   // offline tills: unique id per queued sale
  soldAt: z.coerce.date().optional(),                // offline tills: when the sale really happened
  payment: z.object({
    method: z.enum(['cash', 'mpesa', 'credit']).default('cash'),
    amountPaid: z.coerce.number().min(0).optional(),
    mpesaCode: z.string().trim().optional(),
    mpesaPaymentId: z.string().optional(),            // a confirmed STK Push payment (see /api/mpesa)
  }).default({}),
});

// ── Record a sale (one customer transaction) ─────────────────────────────────
r.post('/', validate(saleBody), asyncHandler(async (req, res) => {
  const { items, customerId, payment, clientId, soldAt } = req.body;

  // A retried offline sync returns the sale that was already saved instead of creating a second one
  if (clientId) {
    const dup = await Sale.findOne({ clientId });
    if (dup) return res.json({ ok: true, sale: dup, duplicate: true, lowStock: [] });
  }
  const when = soldAt && soldAt <= new Date() && Date.now() - soldAt.getTime() < 14 * 864e5 ? soldAt : undefined;

  // Merge duplicate lines for the same product
  const wanted = new Map();
  for (const i of items) wanted.set(i.productId, (wanted.get(i.productId) || 0) + i.qty);

  const products = await Product.find({ _id: { $in: [...wanted.keys()] }, isActive: true });
  if (products.length !== wanted.size) throw new HttpError(400, 'One or more products no longer exist');

  // Prices & costs come from the DB, never from the client
  const lines = products.map(p => {
    const qty = wanted.get(String(p._id));
    return {
      product: p._id, productName: p.name, unit: p.unit, qty,
      unitPrice: p.price, unitCost: p.cost,
      lineRevenue: money(p.price * qty), lineProfit: money((p.price - p.cost) * qty),
    };
  });
  const totalRevenue = money(lines.reduce((s, l) => s + l.lineRevenue, 0));
  const totalProfit = money(lines.reduce((s, l) => s + l.lineProfit, 0));

  // Payment logic
  let mpesaDoc = null;
  let mpesaCode = payment.mpesaCode;
  let tendered = payment.method === 'credit' ? (payment.amountPaid ?? 0) : (payment.amountPaid ?? totalRevenue);
  if (payment.mpesaPaymentId) {
    if (payment.method !== 'mpesa') throw new HttpError(400, 'An M-Pesa payment can only be used with the M-Pesa payment method');
    mpesaDoc = await MpesaPayment.findById(payment.mpesaPaymentId);
    if (!mpesaDoc || mpesaDoc.status !== 'success' || mpesaDoc.used)
      throw new HttpError(409, 'That M-Pesa payment is not confirmed or has already been used');
    if (req.user.role !== 'admin' && String(mpesaDoc.createdBy) !== String(req.user._id)) throw new HttpError(403, 'That M-Pesa payment was requested by someone else');
    mpesaCode = mpesaDoc.mpesaReceipt || `STK-${mpesaDoc.checkoutRequestId.slice(-8)}`;   // the receipt number arrives with the callback
    tendered = mpesaDoc.paidAmount ?? mpesaDoc.amount;                                      // what M-Pesa confirmed, not what the client says
  }
  const amountPaid = Math.min(tendered, totalRevenue);
  const balanceOwed = money(totalRevenue - amountPaid);
  const change = payment.method === 'cash' ? money(Math.max(tendered - totalRevenue, 0)) : 0;
  if (payment.method === 'mpesa' && !mpesaCode && amountPaid > 0)
    throw new HttpError(400, 'M-Pesa transaction code is required');

  let customer = null;
  if (balanceOwed > 0 || customerId) {
    if (!customerId) throw new HttpError(400, 'Select a customer for credit / part payments');
    customer = await Customer.findById(customerId);
    if (!customer || !customer.isActive) throw new HttpError(400, 'Customer not found');
    if (balanceOwed > 0 && customer.creditLimit > 0 && customer.balance + balanceOwed > customer.creditLimit)
      throw new HttpError(409, `Credit limit exceeded (limit ${customer.creditLimit}, owes ${customer.balance})`);
  }

  // Claim the M-Pesa payment so it can pay for one sale only; released again if the sale fails
  if (mpesaDoc) {
    const claimed = await MpesaPayment.findOneAndUpdate({ _id: mpesaDoc._id, status: 'success', used: false }, { used: true });
    if (!claimed) throw new HttpError(409, 'That M-Pesa payment has already been used');
  }
  const release = () => (mpesaDoc ? MpesaPayment.updateOne({ _id: mpesaDoc._id }, { used: false }).catch(() => {}) : null);

  let deducted;
  try { deducted = await deductStock(lines); }      // atomic; rolls itself back on failure
  catch (err) { await release(); throw err; }
  let sale;
  try {
    sale = await Sale.create({
      receiptNo: await nextReceiptNo(), clientId, items: lines, totalRevenue, totalProfit,
      ...(when && { createdAt: when }),
      customer: customer?._id, soldBy: req.user._id,
      payment: { method: payment.method, amountPaid, change, balanceOwed, mpesaCode, mpesaPayment: mpesaDoc?._id },
    });
    if (customer && balanceOwed > 0) await Customer.updateOne({ _id: customer._id }, { $inc: { balance: balanceOwed } });
    if (mpesaDoc) await MpesaPayment.updateOne({ _id: mpesaDoc._id }, { sale: sale._id });
  } catch (err) {
    await restoreStock(lines);                      // sale failed -> put stock back
    await release();
    throw err;
  }
  await logMovements(deducted, { type: 'sale', reference: sale._id, by: req.user._id, sign: -1 });

  const lowStock = await Product.find({ _id: { $in: lines.map(l => l.product) }, $expr: { $lte: ['$stockQty', '$lowStockThreshold'] } })
    .select('name unit stockQty lowStockThreshold');
  res.status(201).json({ ok: true, sale, lowStock });
}));

// ── List / filter ────────────────────────────────────────────────────────────
r.get('/', asyncHandler(async (req, res) => {
  const { from, to, status, customer } = req.query;
  const q = {};
  if (req.user.role !== 'admin') q.soldBy = req.user._id;     // cashiers only see their own
  if (status) q.status = status;
  if (customer) q.customer = customer;
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(`${from}T00:00:00+03:00`);
    if (to) q.createdAt.$lt = new Date(new Date(`${to}T00:00:00+03:00`).getTime() + 864e5);
  }
  const sales = await Sale.find(q).sort('-createdAt').limit(Math.min(Number(req.query.limit) || 100, 500))
    .populate('customer', 'name phone').populate('soldBy', 'fullName');
  res.json({ ok: true, count: sales.length, sales });
}));

r.get('/:id', asyncHandler(async (req, res) => {
  const s = await Sale.findById(req.params.id).populate('customer', 'name phone').populate('soldBy', 'fullName');
  if (!s) throw new HttpError(404, 'Sale not found');
  if (req.user.role !== 'admin' && String(s.soldBy._id) !== String(req.user._id)) throw new HttpError(403, 'Not your sale');
  res.json({ ok: true, sale: s });
}));

// ── Void a sale: restores stock and reverses any credit (admin) ──────────────
r.post('/:id/void', requireAdmin, validate(z.object({ reason: z.string().min(3) })), asyncHandler(async (req, res) => {
  // Atomic status flip prevents double-voiding
  const sale = await Sale.findOneAndUpdate(
    { _id: req.params.id, status: 'completed' },
    { status: 'voided', voidedBy: req.user._id, voidReason: req.body.reason, voidedAt: new Date() },
    { new: true }
  );
  if (!sale) throw new HttpError(409, 'Sale not found or already voided');

  await restoreStock(sale.items);
  const after = await Product.find({ _id: { $in: sale.items.map(i => i.product) } }).select('stockQty');
  const stockMap = new Map(after.map(p => [String(p._id), p.stockQty]));
  await StockMovement.insertMany(sale.items.map(i => ({
    product: i.product, type: 'void', qtyChange: i.qty, stockAfter: stockMap.get(String(i.product)),
    reference: sale._id, note: req.body.reason, by: req.user._id,
  })));
  if (sale.customer && sale.payment.balanceOwed > 0)
    await Customer.updateOne({ _id: sale.customer }, { $inc: { balance: -sale.payment.balanceOwed } });
  await audit(req.user, 'sale.void', 'Sale', sale._id, { receiptNo: sale.receiptNo, reason: req.body.reason });
  res.json({ ok: true, sale });
}));
export default r;
