import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { HttpError } from './error.js';
import { ctxOf, runWithTenant } from '../tenancy/context.js';
import { getBusiness } from '../services/tenants.js';

export const signToken = (user, business) =>
  jwt.sign({ sub: user._id, role: user.role, biz: String(business._id) }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });

// Identifies the user AND the business from the token. Everything after this middleware runs inside that
// business's context, so every database call goes to that business's own database and no other.
export function requireAuth(req, _res, next) {
  (async () => {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Not authenticated');
    let payload;
    try { payload = jwt.verify(h.slice(7), process.env.JWT_SECRET); }
    catch { throw new HttpError(401, 'Session expired, please log in again'); }
    if (!payload.biz) throw new HttpError(401, 'Session expired, please log in again');
    const business = await getBusiness(payload.biz);
    if (!business) throw new HttpError(401, 'This business account no longer exists');
    if (business.status !== 'active') throw new HttpError(403, 'This business account is suspended. Contact support.');
    const ctx = ctxOf(business);
    const user = await runWithTenant(ctx, () => User.findById(payload.sub));
    if (!user || !user.isActive) throw new HttpError(401, 'Account not available');
    req.user = user;
    req.business = business;
    runWithTenant(ctx, () => next());
  })().catch(next);
}

export const requireAdmin = (req, _res, next) =>
  req.user?.role === 'admin' ? next() : next(new HttpError(403, 'Admin access required'));
