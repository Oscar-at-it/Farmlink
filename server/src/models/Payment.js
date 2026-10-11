import mongoose from 'mongoose';
import { defineModel } from '../tenancy/models.js';
// Debt repayments from customers
export default defineModel('Payment', new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, enum: ['cash', 'mpesa'], default: 'cash' },
  mpesaCode: String,
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));
