import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap, parse } from '../middleware/util.js';

const router = Router();
router.use(requireAuth);

// Hanya https:// atau path poster lokal. z.string().url() bawaan menerima
// "javascript:alert(1)", yang menjadi stored XSS bila dirender sebagai link.
const safeUrl = z
  .string()
  .max(300)
  .refine((v) => {
    if (/^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(v)) return true;
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'URL harus https:// atau /uploads/...');

// .strict(): field di luar daftar ditolak (mencegah mass assignment).
const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(120).optional(),
    avatarUrl: safeUrl.optional(),
  })
  .strict();

router.get('/me', wrap(async (req, res) => {
  const user = await User.findOne({ address: req.user.address });
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
  res.json(user);
}));

router.put('/me', wrap(async (req, res) => {
  const data = parse(profileSchema, req.body, res);
  if (!data) return;
  const user = await User.findOneAndUpdate(
    { address: req.user.address },
    { $set: data },
    { new: true }
  );
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan, silakan login ulang' });
  res.json(user);
}));

router.delete('/me', wrap(async (req, res) => {
  await User.deleteOne({ address: req.user.address });
  res.status(204).end();
}));

export default router;
