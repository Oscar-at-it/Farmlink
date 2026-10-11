import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const r = Router();
r.get('/', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const entries = await AuditLog.find().sort('-createdAt').limit(200).populate('user', 'fullName');
  res.json({ ok: true, entries });
}));
export default r;
