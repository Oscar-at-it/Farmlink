import { Router } from 'express';
import { z } from 'zod';
import Customer from '../models/Customer.js';
import Payment from '../models/Payment.js';
import Sale from '../models/Sale.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

const r = Router();
r.use(requireAuth);
const body = z.object({
  name: z.string().min(1), phone: z.string().trim().min(7).optional(),
  location: z.string().optional(), creditLimit: z.coerce.number().min(0).default(0),
});

r.get('/', asyncHandler(async (req, res) => {
  const q = { isActive: true };
  if (req.query.debtors === 'true') q.balance = { $gt: 0 };
  if (req.query.search) {
    const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ name: rx }, { phone: rx }];
  }
  const customers = await Customer.find(q).sort(req.query.debtors === 'true' ? '-balance' : 'name').limit(200);
  const totalOwed = customers.reduce((s, c) => s + Math.max(c.balance, 0), 0);
  res.json({ ok: true, customers, totalOwed });
}));

r.post('/', validate(body), asyncHandler(async (req, res) =>
  res.status(201).json({ ok: true, customer: await Customer.create(req.body) })));

r.get('/:id', asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new HttpError(404, 'Customer not found');
  const [sales, payments] = await Promise.all([
    Sale.find({ customer: customer._id }).sort('-createdAt').limit(50).select('receiptNo totalRevenue payment status createdAt'),
    Payment.find({ customer: customer._id }).sort('-createdAt').limit(50),
  ]);
  res.json({ ok: true, customer, sales, payments });
}));

r.patch('/:id', validate(body.partial().extend({ isActive: z.boolean().optional() })), asyncHandler(async (req, res) => {
  const c = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!c) throw new HttpError(404, 'Customer not found');
  res.json({ ok: true, customer: c });
}));

// Record a debt repayment
r.post('/:id/payments', validate(z.object({
  amount: z.coerce.number().positive(), method: z.enum(['cash', 'mpesa']).default('cash'), mpesaCode: z.string().optional(),
})), asyncHandler(async (req, res) => {
  const c = await Customer.findById(req.params.id);
  if (!c) throw new HttpError(404, 'Customer not found');
  if (req.body.amount > c.balance) throw new HttpError(400, `Payment exceeds balance owed (${c.balance})`);
  const updated = await Customer.findByIdAndUpdate(c._id, { $inc: { balance: -req.body.amount } }, { new: true });
  const payment = await Payment.create({ ...req.body, customer: c._id, receivedBy: req.user._id });
  res.status(201).json({ ok: true, payment, balance: updated.balance });
}));
export default r;
