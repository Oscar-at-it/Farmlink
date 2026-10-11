import { Router } from 'express';
import { z } from 'zod';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

const r = Router();
r.use(requireAuth);
const body = z.object({ name: z.string().min(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() });

r.get('/', asyncHandler(async (_q, res) => res.json({ ok: true, categories: await Category.find().sort('name') })));
r.post('/', requireAdmin, validate(body), asyncHandler(async (req, res) =>
  res.status(201).json({ ok: true, category: await Category.create(req.body) })));
r.patch('/:id', requireAdmin, validate(body.partial()), asyncHandler(async (req, res) => {
  const c = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!c) throw new HttpError(404, 'Category not found');
  res.json({ ok: true, category: c });
}));
r.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  if (await Product.exists({ category: req.params.id })) throw new HttpError(409, 'Category still has products');
  await Category.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));
export default r;
