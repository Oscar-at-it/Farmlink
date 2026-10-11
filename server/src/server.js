import 'dotenv/config';
import app from './app.js';
import { connectDB } from './config/db.js';

const required = ['MONGO_URI', 'JWT_SECRET'];
for (const k of required) if (!process.env[k]) { console.error(`Missing env var ${k}`); process.exit(1); }

await connectDB();
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`FarmLink API running on :${port}`));
