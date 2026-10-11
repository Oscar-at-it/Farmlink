import crypto from 'node:crypto';

// AES-256-GCM for secrets stored in the database (for example each business's Daraja consumer secret and passkey).
const key = () => crypto.createHash('sha256').update(process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || '').digest();

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}
export function decrypt(payload) {
  const [iv, tag, enc] = String(payload).split('.').map(s => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
