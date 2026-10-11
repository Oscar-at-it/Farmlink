import crypto from 'node:crypto';
import Setting from '../models/Setting.js';
import { decrypt, encrypt } from './crypto.js';

// The business's own M-Pesa Express settings, stored in its own database with secrets encrypted.
export async function getMpesaConfig() {
  const doc = await Setting.findById('mpesa');
  const x = doc?.data;
  if (!x?.consumerKey || !x.consumerSecret || !x.shortcode || !x.passkey) return null;
  return {
    env: x.env === 'production' ? 'production' : 'sandbox',
    consumerKey: x.consumerKey, consumerSecret: decrypt(x.consumerSecret),
    shortcode: x.shortcode, passkey: decrypt(x.passkey),
    transactionType: x.transactionType || 'CustomerPayBillOnline', partyB: x.partyB || undefined,
    callbackSecret: x.callbackSecret,
  };
}

// What the Settings page may see: never the secrets themselves
export async function mpesaSettingsView() {
  const x = (await Setting.findById('mpesa'))?.data || {};
  return {
    configured: !!(x.consumerKey && x.consumerSecret && x.shortcode && x.passkey),
    env: x.env || 'sandbox', shortcode: x.shortcode || '', transactionType: x.transactionType || 'CustomerPayBillOnline', partyB: x.partyB || '',
    consumerKeyHint: x.consumerKey ? '••••' + x.consumerKey.slice(-4) : '', hasSecret: !!x.consumerSecret, hasPasskey: !!x.passkey,
  };
}

// Blank secret fields keep the stored value, so the owner does not have to retype them
export async function saveMpesaSettings(input) {
  const old = (await Setting.findById('mpesa'))?.data || {};
  const data = {
    env: input.env === 'production' ? 'production' : 'sandbox',
    consumerKey: input.consumerKey?.trim() || old.consumerKey,
    consumerSecret: input.consumerSecret?.trim() ? encrypt(input.consumerSecret.trim()) : old.consumerSecret,
    shortcode: input.shortcode?.trim() || old.shortcode,
    passkey: input.passkey?.trim() ? encrypt(input.passkey.trim()) : old.passkey,
    transactionType: input.transactionType === 'CustomerBuyGoodsOnline' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
    partyB: input.partyB?.trim() || '',
    callbackSecret: old.callbackSecret || crypto.randomBytes(24).toString('hex'),
  };
  const missing = [['consumerKey', 'consumer key'], ['consumerSecret', 'consumer secret'], ['shortcode', 'shortcode'], ['passkey', 'passkey']].filter(([k]) => !data[k]).map(([, l]) => l);
  if (missing.length) return { error: `Enter the ${missing.join(', ')}.` };
  if (data.transactionType === 'CustomerBuyGoodsOnline' && !data.partyB) return { error: 'For a Till, enter the Till number.' };
  await Setting.findOneAndUpdate({ _id: 'mpesa' }, { $set: { data } }, { upsert: true, new: true });
  return {};
}
export const clearMpesaSettings = () => Setting.deleteOne({ _id: 'mpesa' });
