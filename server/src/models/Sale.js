import mongoose from 'mongoose';
import { defineModel } from '../tenancy/models.js';

const itemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  // Snapshots: history stays correct even if the product is edited or deleted
  productName: String,
  unit: String,
  qty: { type: Number, required: true, min: 0.001 },
  unitPrice: Number,
  unitCost: Number,
  lineRevenue: Number,
  lineProfit: Number,
}, { _id: false });

const saleSchema = new mongoose.Schema({
  receiptNo: { type: String, unique: true },
  clientId: { type: String, unique: true, sparse: true },   // set by offline tills so a retried sync never duplicates a sale
  items: { type: [itemSchema], validate: v => v.length > 0 },
  totalRevenue: Number,
  totalProfit: Number,
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  payment: {
    method: { type: String, enum: ['cash', 'mpesa', 'credit'], default: 'cash' },
    amountPaid: { type: Number, default: 0 },
    change: { type: Number, default: 0 },
    balanceOwed: { type: Number, default: 0 },
    mpesaCode: String,
    mpesaPayment: { type: mongoose.Schema.Types.ObjectId, ref: 'MpesaPayment' },   // set when paid through STK Push
  },
  soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['completed', 'voided'], default: 'completed', index: true },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  voidReason: String,
  voidedAt: Date,
}, { timestamps: true });

saleSchema.index({ createdAt: -1 });
export default defineModel('Sale', saleSchema);
