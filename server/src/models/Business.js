import mongoose from 'mongoose';

// Lives in the shared platform database. One document per agrovet that has registered.
// Everything the business owns (users, products, sales, ...) lives in its own database, named in dbName.
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },   // the business code staff type to sign in
  dbName: { type: String, required: true, unique: true },
  ownerName: String,
  ownerPhone: String,
  ownerEmail: { type: String, lowercase: true, trim: true },
  phone: String,                      // shown on receipts
  address: String,                    // shown on receipts
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
  plan: { type: String, default: 'free' },
}, { timestamps: true });

export default mongoose.model('Business', schema);
