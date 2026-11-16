import { Router } from 'express';
import { z } from 'zod';
import { EventDetail } from '../models/EventDetail.js';
import { getEventOrganizer, isOrganizer } from '../config/chain.js';
import { Upload } from '../models/Upload.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap, parse, eventIdParam } from '../middleware/util.js';

const router = Router();

const detailSchema = z
  .object({
    description: z.string().max(5000),
    location: z.string().max(200),
    posterUrl: z.string().regex(/^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/).optional(),
  })
  .strict();

// Cek ke smart contract: hanya EO pemilik event yang role-nya MASIH aktif.
async function ensureOwner(req, res) {
  if (!(await isOrganizer(req.user.address))) {
    res.status(403).json({ error: 'Role Event Organizer tidak aktif' });
    return false;
  }
  const organizer = await getEventOrganizer(Number(req.params.id));
  if (!organizer) {
    res.status(404).json({ error: 'Event tidak ada di blockchain' });
    return false;
  }
  if (organizer !== req.user.address) {
    res.status(403).json({ error: 'Bukan pemilik event' });
    return false;
  }
  return true;
}

router.get('/:id/details', wrap(async (req, res) => {
  const p = parse(eventIdParam, req.params, res);
  if (!p) return;
  const detail = await EventDetail.findOne({ eventId: p.id });
  if (!detail) return res.status(404).json({ error: 'Detail belum diisi' });
  res.json(detail);
}));

router.put('/:id/details', requireAuth, wrap(async (req, res) => {
  const p = parse(eventIdParam, req.params, res);
  if (!p) return;
  const data = parse(detailSchema, req.body, res);
  if (!data) return;
  if (!(await ensureOwner(req, res))) return;
  // Poster baru harus hasil upload EO ini sendiri (poster yang sudah terpasang boleh dipertahankan).
  if (data.posterUrl) {
    const current = await EventDetail.findOne({ eventId: p.id });
    if (current?.posterUrl !== data.posterUrl) {
      const up = await Upload.findOne({ name: data.posterUrl.slice('/uploads/'.length) });
      if (!up || up.owner !== req.user.address) {
        return res.status(403).json({ error: 'Poster harus diunggah oleh akun ini' });
      }
    }
  }
  const detail = await EventDetail.findOneAndUpdate(
    { eventId: p.id },
    { $set: { ...data, updatedBy: req.user.address } },
    { new: true, upsert: true }
  );
  res.json(detail);
}));

router.delete('/:id/details', requireAuth, wrap(async (req, res) => {
  const p = parse(eventIdParam, req.params, res);
  if (!p) return;
  // Setelah event dihapus on-chain, pemilik lama masih boleh membersihkan detailnya
  // (dicek dari updatedBy), supaya tidak ada data yatim.
  const organizer = await getEventOrganizer(p.id);
  if (!organizer) {
    const detail = await EventDetail.findOne({ eventId: p.id });
    if (!detail) return res.status(404).json({ error: 'Detail tidak ditemukan' });
    if (detail.updatedBy !== req.user.address) return res.status(403).json({ error: 'Bukan pemilik event' });
    await EventDetail.deleteOne({ eventId: p.id });
    return res.status(204).end();
  }
  if (!(await ensureOwner(req, res))) return;
  await EventDetail.deleteOne({ eventId: p.id });
  res.status(204).end();
}));

export default router;
