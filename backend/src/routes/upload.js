import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth, requireOrganizer } from '../middleware/auth.js';
import { wrap } from '../middleware/util.js';
import { Upload } from '../models/Upload.js';

export const uploadDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
await fs.mkdir(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 }, // maks 2 MB, 1 file
});

// Deteksi tipe file dari isi aslinya (magic bytes), bukan dari ekstensi/Content-Type.
function sniff(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

// Batas upload per wallet EO (bukan per IP), supaya disk tidak bisa dibanjiri.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.user.address,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak upload, coba lagi nanti' },
});

const router = Router();

router.post('/poster', requireAuth, requireOrganizer, uploadLimiter, upload.single('poster'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File dengan field "poster" diperlukan' });
  const ext = sniff(req.file.buffer);
  if (!ext) return res.status(400).json({ error: 'Hanya JPG, PNG, atau WEBP' });
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`; // nama asli dari user dibuang
  await fs.writeFile(path.join(uploadDir, name), req.file.buffer);
  await Upload.create({ name, owner: req.user.address });
  res.status(201).json({ url: `/uploads/${name}` });
}));

export default router;
