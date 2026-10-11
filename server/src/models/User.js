import mongoose from 'mongoose';
import { defineModel } from '../tenancy/models.js';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true, select: false },
  fullName: { type: String, required: true, trim: true },
  role: { type: String, enum: ['admin', 'cashier'], default: 'cashier' },
  isActive: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
}, { timestamps: true });

userSchema.methods.setPassword = async function (plain) { this.passwordHash = await bcrypt.hash(plain, 12); };
userSchema.methods.checkPassword = function (plain) { return bcrypt.compare(plain, this.passwordHash); };
userSchema.methods.toJSON = function () { const o = this.toObject(); delete o.passwordHash; return o; };

export default defineModel('User', userSchema);
