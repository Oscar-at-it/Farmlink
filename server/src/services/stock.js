import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import { HttpError } from '../middleware/error.js';

/**
 * Atomically deduct stock for a list of { product(_id), productName, qty }.
 * Each deduction only succeeds if enough stock remains, so two cashiers can never
 * sell the same last unit. If any line fails, earlier deductions are rolled back.
 * (Works on a standalone MongoDB; no replica set / transactions required.)
 */
export async function deductStock(lines) {
  const done = [];
  try {
    for (const l of lines) {
      const updated = await Product.findOneAndUpdate(
        { _id: l.product, isActive: true, stockQty: { $gte: l.qty } },
        { $inc: { stockQty: -l.qty } },
        { new: true }
      );
      if (!updated) throw new HttpError(409, `Not enough stock for "${l.productName}"`);
      done.push({ ...l, stockAfter: updated.stockQty });
    }
    return done;
  } catch (err) {
    await Promise.all(done.map(d => Product.updateOne({ _id: d.product }, { $inc: { stockQty: d.qty } })));
    throw err;
  }
}

export const restoreStock = lines =>
  Promise.all(lines.map(l => Product.updateOne({ _id: l.product }, { $inc: { stockQty: l.qty } })));

export const logMovements = (rows, base) =>
  StockMovement.insertMany(rows.map(r => ({ ...base, product: r.product, qtyChange: base.sign * r.qty, stockAfter: r.stockAfter })));
