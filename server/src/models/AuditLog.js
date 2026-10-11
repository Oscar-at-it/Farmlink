import mongoose from 'mongoose';
import { defineModel } from '../tenancy/models.js';
export default defineModel('AuditLog', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: String,        // e.g. 'product.price_change', 'sale.void'
  entity: String,
  entityId: mongoose.Schema.Types.ObjectId,
  details: mongoose.Schema.Types.Mixed,
}, { timestamps: true }));
