import mongoose from 'mongoose';
import { defineModel } from '../tenancy/models.js';
// Audit trail for every change to stock
export default defineModel('StockMovement', new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  type: { type: String, enum: ['sale', 'restock', 'adjustment', 'void'], required: true },
  qtyChange: { type: Number, required: true },   // negative = stock out
  stockAfter: Number,
  reference: { type: mongoose.Schema.Types.ObjectId },   // e.g. Sale id
  note: String,
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));
