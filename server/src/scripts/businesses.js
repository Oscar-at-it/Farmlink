import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Business from '../models/Business.js';

// Platform owner tool:  node src/scripts/businesses.js list | suspend <code> | activate <code>
const [cmd, code] = process.argv.slice(2);
await connectDB();
if (cmd === 'list' || !cmd) {
  const list = await Business.find().sort('createdAt');
  console.log(`${list.length} business(es)`);
  for (const b of list) console.log(`${b.slug.padEnd(24)} ${b.status.padEnd(10)} ${b.name}  [${b.dbName}]  ${b.ownerName || ''} ${b.ownerPhone || ''}`);
} else if (['suspend', 'activate'].includes(cmd) && code) {
  const b = await Business.findOneAndUpdate({ slug: code.toLowerCase() }, { status: cmd === 'suspend' ? 'suspended' : 'active' }, { new: true });
  console.log(b ? `${b.name} is now ${b.status}. (Takes effect within 30 seconds.)` : 'No business with that code.');
} else console.log('Usage: npm run businesses -- list | suspend <code> | activate <code>');
await mongoose.disconnect();
