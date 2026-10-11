import mongoose from 'mongoose';
import { defineModel } from '../tenancy/models.js';

// Per-business settings. _id 'mpesa' holds that business's own Daraja credentials (secrets encrypted).
export default defineModel('Setting', new mongoose.Schema({
  _id: String,
  data: mongoose.Schema.Types.Mixed,
}, { timestamps: true }));
