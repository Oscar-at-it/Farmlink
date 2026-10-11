import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import Business from '../models/Business.js';
import { requireAuth, requireAdmin, signToken } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { ctxOf, runWithTenant } from '../tenancy/context.js';
import { createBusiness, publicBusiness, slugAvailable, uniqueSlug, validSlug, slugify } from '../services/tenants.js';

const r = Router();
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);   // keeps response time similar when the business code is wrong

// ── Sign in: business code + username + password ────────────────────────────
r.post('/login', validate(z.object({ business: z.string().min(1), username: z.string().min(1), password: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const fail = () => new HttpError(401, 'Incorrect business code, username or password');
    const business = await Business.findOne({ slug: req.body.business.trim().toLowerCase() });
    if (!business) { await bcrypt.compare(req.body.password, DUMMY_HASH); throw fail(); }
    const user = await runWithTenant(ctxOf(business), () =>
      User.findOne({ username: req.body.username.trim().toLowerCase() }).select('+passwordHash'));
    if (!user || !user.isActive || !(await user.checkPassword(req.body.password))) throw fail();
    if (business.status !== 'active') throw new HttpError(403, 'This business account is suspended. Contact support.');
    res.json({ ok: true, token: signToken(user, business), user, business: publicBusiness(business) });
  }));

// ── Register a new business: creates its own database and the owner's admin account ──
const registerBody = z.object({
  businessName: z.string().trim().min(2).max(80),
  businessCode: z.string().trim().toLowerCase().optional(),
  ownerName: z.string().trim().min(2).max(80),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, 'Username: 3 to 30 letters, numbers, dots, dashes or underscores'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().trim().min(7).max(20).optional().or(z.literal('')),
  email: z.string().trim().email().optional().or(z.literal('')),
  starterCatalogue: z.boolean().optional(),
});
r.post('/register-business', rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { ok: false, error: 'Too many registrations from this address. Try again later.' } }),
  validate(registerBody), asyncHandler(async (req, res) => {
    const b = req.body;
    const slug = b.businessCode || (await uniqueSlug(b.businessName));
    const { business, user } = await createBusiness({
      name: b.businessName, slug, ownerName: b.ownerName, username: b.username, password: b.password,
      phone: b.phone || undefined, email: b.email || undefined, starterCatalogue: !!b.starterCatalogue,
    });
    res.status(201).json({ ok: true, token: signToken(user, business), user, business: publicBusiness(business) });
  }));

// Live check while the owner types a business code, plus a suggestion made from the business name
r.get('/business-code', rateLimit({ windowMs: 60 * 1000, max: 60 }), asyncHandler(async (req, res) => {
  const name = String(req.query.name || '');
  const code = String(req.query.code || (name ? slugify(name) : '')).toLowerCase();
  const suggestion = name ? await uniqueSlug(name) : null;
  res.json({ ok: true, code, valid: validSlug(code), available: code ? await slugAvailable(code) : false, suggestion });
}));

r.get('/me', requireAuth, (req, res) => res.json({ ok: true, user: req.user, business: publicBusiness(req.business) }));

r.post('/change-password', requireAuth,
  validate(z.object({ currentPassword: z.string(), newPassword: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await user.checkPassword(req.body.currentPassword))) throw new HttpError(400, 'Current password is wrong');
    await user.setPassword(req.body.newPassword);
    user.mustChangePassword = false;
    await user.save();
    res.json({ ok: true });
  }));

// ---- staff management (admin of this business) ----
const userBody = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, 'Username: 3 to 30 letters, numbers, dots, dashes or underscores'),
  fullName: z.string().min(1),
  password: z.string().min(8), role: z.enum(['admin', 'cashier']).default('cashier'),
});
r.get('/users', requireAuth, requireAdmin, asyncHandler(async (_q, res) =>
  res.json({ ok: true, users: await User.find().sort('fullName') })));

r.post('/users', requireAuth, requireAdmin, validate(userBody), asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body;
  const u = new User({ ...rest, mustChangePassword: true });
  await u.setPassword(password);
  await u.save();
  await audit(req.user, 'user.create', 'User', u._id, { username: u.username, role: u.role });
  res.status(201).json({ ok: true, user: u });
}));

r.patch('/users/:id', requireAuth, requireAdmin,
  validate(z.object({ fullName: z.string().min(1), role: z.enum(['admin', 'cashier']), isActive: z.boolean() }).partial()),
  asyncHandler(async (req, res) => {
    if (req.params.id === String(req.user._id) && (req.body.isActive === false || req.body.role === 'cashier'))
      throw new HttpError(400, 'You cannot demote or deactivate yourself');
    const u = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!u) throw new HttpError(404, 'User not found');
    await audit(req.user, 'user.update', 'User', u._id, { username: u.username, ...req.body });
    res.json({ ok: true, user: u });
  }));

r.post('/users/:id/reset-password', requireAuth, requireAdmin,
  validate(z.object({ newPassword: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.params.id).select('+passwordHash');
    if (!u) throw new HttpError(404, 'User not found');
    await u.setPassword(req.body.newPassword);
    u.mustChangePassword = true;
    await u.save();
    await audit(req.user, 'user.reset_password', 'User', u._id, { username: u.username });
    res.json({ ok: true });
  }));

export default r;
