import { Router } from 'express';
import { z } from 'zod';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { audit } from '../services/audit.js';

const r = Router();
r.use(requireAuth);

const body = z.object({
  name: z.string().min(1), category: z.string().min(1),
  price: z.coerce.number().min(0), cost: z.coerce.number().min(0),
  unit: z.string().default('piece'),
  stockQty: z.coerce.number().min(0).default(0),
  lowStockThreshold: z.coerce.number().min(0).default(5),
  barcode: z.string().trim().min(1).optional(),
});

r.get('/', asyncHandler(async (req, res) => {
  const { search, category, lowStock, barcode, includeInactive } = req.query;
  const q = includeInactive === 'true' && req.user.role === 'admin' ? {} : { isActive: true };
  if (category) q.category = category;
  if (barcode) q.barcode = barcode;
  if (search) q.name = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (lowStock === 'true') q.$expr = { $lte: ['$stockQty', '$lowStockThreshold'] };
  let query = Product.find(q).populate('category', 'name color').sort('name');
  const products = await query;
  // Cashiers don't need cost/profit data
  const out = req.user.role === 'admin' ? products : products.map(p => { const o = p.toJSON(); delete o.cost; return o; });
  res.json({ ok: true, count: out.length, products: out });
}));

r.get('/:id', asyncHandler(async (req, res) => {
  const p = await Product.findById(req.params.id).populate('category', 'name color');
  if (!p) throw new HttpError(404, 'Product not found');
  res.json({ ok: true, product: p });
}));

r.post('/', requireAdmin, validate(body), asyncHandler(async (req, res) => {
  if (!(await Category.exists({ _id: req.body.category }))) throw new HttpError(400, 'Unknown category');
  const p = await Product.create(req.body);
  await audit(req.user, 'product.create', 'Product', p._id, { name: p.name });
  res.status(201).json({ ok: true, product: p });
}));

r.patch('/:id', requireAdmin, validate(body.partial().extend({ isActive: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    const before = await Product.findById(req.params.id);
    if (!before) throw new HttpError(404, 'Product not found');
    const { stockQty, ...safe } = req.body;   // stock changes go through /api/stock so they are logged
    Object.assign(before, safe);
    await before.save();
    if (safe.price !== undefined || safe.cost !== undefined)
      await audit(req.user, 'product.price_change', 'Product', before._id, { price: before.price, cost: before.cost });
    res.json({ ok: true, product: before });
  }));

// Soft delete: keeps product available to historical sales
r.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const p = await Product.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!p) throw new HttpError(404, 'Product not found');
  await audit(req.user, 'product.deactivate', 'Product', p._id, { name: p.name });
  res.json({ ok: true });
}));
export default r;
