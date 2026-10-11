import mongoose from 'mongoose';
import { defineModel } from '../tenancy/models.js';
export default defineModel('Category', new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  color: { type: String, default: '#1D9E75' },
}, { timestamps: true }));
