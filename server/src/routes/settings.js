import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { audit } from '../services/audit.js';
import { clearMpesaSettings, mpesaSettingsView, saveMpesaSettings } from '../services/mpesaConfig.js';

const r = Router();
r.use(requireAuth, requireAdmin);

r.get('/mpesa', asyncHandler(async (_req, res) =>
  res.json({ ok: true, settings: await mpesaSettingsView(), callbackBaseConfigured: !!process.env.MPESA_CALLBACK_BASE_URL })));

r.put('/mpesa', validate(z.object({
  env: z.enum(['sandbox', 'production']).default('sandbox'),
  consumerKey: z.string().optional(), consumerSecret: z.string().optional(),
  shortcode: z.string().regex(/^\d{4,10}$/, 'The shortcode is the Paybill or store number, digits only').optional().or(z.literal('')),
  passkey: z.string().optional(),
  transactionType: z.enum(['CustomerPayBillOnline', 'CustomerBuyGoodsOnline']).default('CustomerPayBillOnline'),
  partyB: z.string().regex(/^\d{4,10}$/, 'The Till number is digits only').optional().or(z.literal('')),
})), asyncHandler(async (req, res) => {
  const { error } = await saveMpesaSettings(req.body);
  if (error) throw new HttpError(400, error);
  await audit(req.user, 'settings.mpesa', 'Setting', undefined, { env: req.body.env, shortcode: req.body.shortcode });
  res.json({ ok: true, settings: await mpesaSettingsView() });
}));

r.delete('/mpesa', asyncHandler(async (req, res) => {
  await clearMpesaSettings();
  await audit(req.user, 'settings.mpesa_removed', 'Setting');
  res.json({ ok: true });
}));
export default r;
