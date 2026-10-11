import { Router } from 'express';
import { z } from 'zod';
import Business from '../models/Business.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { invalidateBusiness, publicBusiness } from '../services/tenants.js';

const r = Router();
r.use(requireAuth);

r.get('/', (req, res) => res.json({ ok: true, business: publicBusiness(req.business) }));

// The business code and database never change. The owner can change what customers see on receipts.
r.patch('/', requireAdmin, validate(z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(160),
}).partial()), asyncHandler(async (req, res) => {
  const b = await Business.findByIdAndUpdate(req.business._id, req.body, { new: true });
  invalidateBusiness(b._id);
  await audit(req.user, 'business.update', 'Business', b._id, req.body);
  res.json({ ok: true, business: publicBusiness(b) });
}));
export default r;
