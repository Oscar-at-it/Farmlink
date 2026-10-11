import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const notFound = (_req, _res, next) => next(new HttpError(404, 'Route not found'));

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ ok: false, error: err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ') });
  }
  if (err.code === 11000) return res.status(409).json({ ok: false, error: 'Duplicate value: ' + Object.keys(err.keyValue || {}).join(', ') });
  if (err.name === 'CastError') return res.status(400).json({ ok: false, error: 'Invalid id' });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ ok: false, error: status === 500 ? 'Server error' : err.message });
}
