import mongoose from 'mongoose';
import { defineModel } from '../tenancy/models.js';
export default defineModel('Customer', new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true, unique: true, sparse: true },
  location: { type: String, trim: true },
  balance: { type: Number, default: 0 },      // amount owed to the shop (credit sales)
  creditLimit: { type: Number, default: 0 },  // 0 = no limit enforced
  isActive: { type: Boolean, default: true },
}, { timestamps: true }));
