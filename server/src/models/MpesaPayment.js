import mongoose from 'mongoose';
import { defineModel } from '../tenancy/models.js';

// One STK Push request and its outcome. A sale can only use a payment that is 'success' and not yet 'used'.
const schema = new mongoose.Schema({
  checkoutRequestId: { type: String, required: true, unique: true },
  merchantRequestId: String,
  phone: { type: String, required: true },
  amount: { type: Number, required: true },          // amount requested (whole shillings)
  paidAmount: Number,                                // amount M-Pesa reports as paid
  status: { type: String, enum: ['pending', 'success', 'failed', 'cancelled', 'timeout'], default: 'pending', index: true },
  resultCode: Number,
  resultDesc: String,
  mpesaReceipt: String,                              // e.g. SJK4T7XYZ1 (only known from the callback)
  transactionDate: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  used: { type: Boolean, default: false },           // claimed by a sale
  sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
  lastQueryAt: Date,
  callbackAt: Date,
  rawCallback: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

export default defineModel('MpesaPayment', schema);
