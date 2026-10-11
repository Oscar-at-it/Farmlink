import Business from '../models/Business.js';
import User from '../models/User.js';
import { HttpError } from '../middleware/error.js';
import { ctxOf, runWithTenant } from '../tenancy/context.js';
import { prepareTenant, tenantConnection } from '../tenancy/models.js';
import { installStarterCatalogue } from './starterCatalogue.js';

const RESERVED = new Set(['admin', 'api', 'app', 'www', 'platform', 'local', 'config', 'test', 'root', 'system', 'support', 'null', 'undefined']);

export const slugify = name =>
  String(name || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');
export const validSlug = s => /^[a-z0-9][a-z0-9-]{2,29}$/.test(s) && !s.endsWith('-') && !RESERVED.has(s);
export const dbNameFor = slug => 'fl_' + slug.replace(/-/g, '_');

export const publicBusiness = b => ({ id: String(b._id), name: b.name, code: b.slug, phone: b.phone || '', address: b.address || '' });

// Business lookups happen on every request, so keep them in memory briefly
const cache = new Map();
export async function getBusiness(id) {
  const hit = cache.get(String(id));
  if (hit && hit.exp > Date.now()) return hit.doc;
  let doc = null;
  try { doc = await Business.findById(id); } catch { doc = null; }
  if (doc) cache.set(String(id), { doc, exp: Date.now() + 30_000 });
  return doc;
}
export const invalidateBusiness = id => cache.delete(String(id));

export async function slugAvailable(slug) {
  return validSlug(slug) && !(await Business.exists({ slug }));
}
// Suggests a free code from the business name: chap-chap-agrovet, chap-chap-agrovet-2, ...
export async function uniqueSlug(name) {
  let base = slugify(name);
  if (base.length < 3) base = (base + '-shop').replace(/^-/, '');
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 27)}-${i + 1}`;
    if (await slugAvailable(candidate)) return candidate;
  }
  return `${base.slice(0, 22)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Registers a new business: platform record, its own fresh database, and the owner's administrator account.
 * Nothing is copied from any other business. With starterCatalogue the new database also gets common agrovet products.
 */
export async function createBusiness({ name, slug, ownerName, username, password, phone, email, starterCatalogue }) {
  if (!validSlug(slug)) throw new HttpError(400, 'The business code must be 3 to 30 letters, numbers or hyphens, and cannot be a reserved word.');
  if (await Business.exists({ slug })) throw new HttpError(409, 'That business code is already taken. Choose another.');
  let business;
  try {
    business = await Business.create({ name, slug, dbName: dbNameFor(slug), ownerName, ownerPhone: phone, ownerEmail: email });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'That business code is already taken. Choose another.');
    throw err;
  }
  try {
    await prepareTenant(business.dbName);
    const user = await runWithTenant(ctxOf(business), async () => {
      const u = new User({ username, fullName: ownerName, role: 'admin', mustChangePassword: false });
      await u.setPassword(password);
      await u.save();
      if (starterCatalogue) await installStarterCatalogue();
      return u;
    });
    return { business, user };
  } catch (err) {
    // Leave no half-created business behind
    await Business.deleteOne({ _id: business._id });
    try { await tenantConnection(business.dbName).dropDatabase(); } catch { /* nothing to drop */ }
    throw err;
  }
}
