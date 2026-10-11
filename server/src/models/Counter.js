import mongoose from 'mongoose';
import { defineModel } from '../tenancy/models.js';
const Counter = defineModel('Counter', new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }));
export async function nextReceiptNo() {
  const c = await Counter.findByIdAndUpdate('receipt', { $inc: { seq: 1 } }, { new: true, upsert: true });
  return 'R' + String(c.seq).padStart(6, '0');
}
