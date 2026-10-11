import mongoose from 'mongoose';

// The default connection points at the shared platform database, which only lists businesses.
// Each business's own data is in its own database, reached through the tenant models.
export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.PLATFORM_DB || 'farmlink_platform' });
  console.log('Platform database:', mongoose.connection.name);
}
