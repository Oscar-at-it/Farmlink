import mongoose from 'mongoose';
import { defineModel } from '../tenancy/models.js';

const batchSchema = new mongoose.Schema({
  batchNo: String,
  expiryDate: Date,
  qty: { type: Number, min: 0 },
  receivedAt: { type: Date, default: Date.now },
}, { _id: true });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  price: { type: Number, required: true, min: 0 },
  cost: { type: Number, required: true, min: 0 },
  unit: { type: String, default: 'piece', trim: true },
  stockQty: { type: Number, default: 0, min: 0 },
  lowStockThreshold: { type: Number, default: 5, min: 0 },
  barcode: { type: String, trim: true, sparse: true, unique: true },
  batches: [batchSchema],            // optional: expiry tracking (vet products, pesticides)
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

productSchema.index({ name: 'text' });
productSchema.virtual('isLow').get(function () { return this.stockQty <= this.lowStockThreshold; });
productSchema.set('toJSON', { virtuals: true });

export default defineModel('Product', productSchema);
