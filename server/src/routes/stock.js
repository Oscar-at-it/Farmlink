import { Router } from 'express';
import { z } from 'zod';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { audit } from '../services/audit.js';

const r = Router();
r.use(requireAuth);

// Low stock list, most urgent first (replaces get_low_stock)
r.get('/low', asyncHandler(async (_q, res) => {
  const items = await Product.aggregate([
    { $match: { isActive: true, $expr: { $lte: ['$stockQty', '$lowStockThreshold'] } } },
    { $addFields: { ratio: { $divide: ['$stockQty', { $max: ['$lowStockThreshold', 0.001] }] } } },
    { $sort: { ratio: 1 } },
    { $project: { name: 1, unit: 1, stockQty: 1, lowStockThreshold: 1 } },
  ]);
  res.json({ ok: true, count: items.length, items });
}));

// Batches expiring within ?days (default 30), including already expired
r.get('/expiring', asyncHandler(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 365);
  const limit = new Date(Date.now() + days * 864e5);
  const items = await Product.aggregate([
    { $match: { isActive: true } }, { $unwind: '$batches' },
    { $match: { 'batches.expiryDate': { $lte: limit }, 'batches.qty': { $gt: 0 } } },
    { $project: { name: 1, unit: 1, batch: '$batches' } },
    { $sort: { 'batch.expiryDate': 1 } },
  ]);
  res.json({ ok: true, count: items.length, items });
}));

r.get('/movements', requireAdmin, asyncHandler(async (req, res) => {
  const q = req.query.product ? { product: req.query.product } : {};
  const movements = await StockMovement.find(q).sort('-createdAt').limit(200)
    .populate('product', 'name unit').populate('by', 'fullName');
  res.json({ ok: true, movements });
}));

r.post('/restock/:id', requireAdmin, validate(z.object({
  qty: z.coerce.number().positive(),
  cost: z.coerce.number().min(0).optional(),        // new unit cost, if it changed
  batchNo: z.string().optional(),
  expiryDate: z.coerce.date().optional(),
  note: z.string().optional(),
})), asyncHandler(async (req, res) => {
  const { qty, cost, batchNo, expiryDate, note } = req.body;
  const update = { $inc: { stockQty: qty } };
  if (cost !== undefined) update.$set = { cost };
  if (batchNo || expiryDate) update.$push = { batches: { batchNo, expiryDate, qty } };
  const p = await Product.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!p) throw new HttpError(404, 'Product not found');
  await StockMovement.create({ product: p._id, type: 'restock', qtyChange: qty, stockAfter: p.stockQty, note, by: req.user._id });
  res.json({ ok: true, product: p });
}));

// Stocktake correction: set the real counted quantity
r.post('/adjust/:id', requireAdmin, validate(z.object({ newQty: z.coerce.number().min(0), note: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const before = await Product.findById(req.params.id);
    if (!before) throw new HttpError(404, 'Product not found');
    const diff = req.body.newQty - before.stockQty;
    before.stockQty = req.body.newQty;
    await before.save();
    await StockMovement.create({ product: before._id, type: 'adjustment', qtyChange: diff, stockAfter: before.stockQty, note: req.body.note, by: req.user._id });
    await audit(req.user, 'stock.adjust', 'Product', before._id, { diff, note: req.body.note });
    res.json({ ok: true, product: before });
  }));
export default r;
