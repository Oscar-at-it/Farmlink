import { Router } from 'express';
import Sale from '../models/Sale.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';

const r = Router();
r.use(requireAuth, requireAdmin);          // profit data is admin-only
const TZ = 'Africa/Nairobi';               // UTC+3, no DST
const DAY = 864e5;
const startOf = d => new Date(`${d}T00:00:00+03:00`);
const dayStr = ms => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);

function range(period, date) {
  const today = dayStr(Date.now());
  if (period === 'today') return { days: 1, start: startOf(today) };
  if (period === 'day') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new HttpError(400, 'date=YYYY-MM-DD required');
    return { days: 1, start: startOf(date) };
  }
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 0;
  if (!days) throw new HttpError(400, 'period must be today, week, month or day');
  return { days, start: new Date(startOf(today).getTime() - (days - 1) * DAY) };
}

async function summarize(start, end) {
  const [s] = await Sale.aggregate([
    { $match: { status: 'completed', createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: null, revenue: { $sum: '$totalRevenue' }, profit: { $sum: '$totalProfit' }, sales: { $sum: 1 }, items: { $sum: { $size: '$items' } } } },
  ]);
  return { revenue: s?.revenue || 0, profit: s?.profit || 0, sales: s?.sales || 0, items: s?.items || 0 };
}
const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

r.get('/', asyncHandler(async (req, res) => {
  const period = req.query.period || 'today';
  const { days, start } = range(period, req.query.date);
  const end = new Date(start.getTime() + days * DAY);
  const prevStart = new Date(start.getTime() - days * DAY);
  const match = { status: 'completed', createdAt: { $gte: start, $lt: end } };

  const [summary, previous, daily, top, payMix, recent] = await Promise.all([
    summarize(start, end),
    summarize(prevStart, start),
    Sale.aggregate([{ $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, revenue: { $sum: '$totalRevenue' }, profit: { $sum: '$totalProfit' }, sales: { $sum: 1 } } }]),
    Sale.aggregate([{ $match: match }, { $unwind: '$items' },
      { $group: { _id: '$items.productName', qty: { $sum: '$items.qty' }, revenue: { $sum: '$items.lineRevenue' }, profit: { $sum: '$items.lineProfit' } } },
      { $sort: { profit: -1 } }, { $limit: 10 }]),
    Sale.aggregate([{ $match: match }, { $group: { _id: '$payment.method', total: { $sum: '$totalRevenue' }, count: { $sum: 1 } } }]),
    days === 1 ? Sale.find(match).sort('-createdAt').limit(50).populate('soldBy', 'fullName') : [],
  ]);

  const map = new Map(daily.map(d => [d._id, d]));
  const series = Array.from({ length: days }, (_, i) => {
    const d = dayStr(start.getTime() + i * DAY);
    return { date: d, revenue: 0, profit: 0, sales: 0, ...(map.get(d) || {}), _id: undefined };
  });

  res.json({
    ok: true, period, from: dayStr(start.getTime()),
    summary: { ...summary, margin: summary.revenue ? Math.round((summary.profit / summary.revenue) * 1000) / 10 : 0 },
    vsPrevious: { revenuePct: pct(summary.revenue, previous.revenue), profitPct: pct(summary.profit, previous.profit) },
    series, topProducts: top.map(t => ({ name: t._id, ...t, _id: undefined })),
    paymentMix: payMix.map(p => ({ method: p._id, total: p.total, count: p.count })),
    recent,
  });
}));

// Which products have not sold in N days (dead stock)
r.get('/dead-stock', asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 30;
  const since = new Date(Date.now() - days * DAY);
  const sold = await Sale.distinct('items.product', { status: 'completed', createdAt: { $gte: since } });
  const { default: Product } = await import('../models/Product.js');
  const items = await Product.find({ isActive: true, stockQty: { $gt: 0 }, _id: { $nin: sold } }).select('name unit stockQty cost');
  res.json({ ok: true, days, count: items.length, items });
}));
export default r;
