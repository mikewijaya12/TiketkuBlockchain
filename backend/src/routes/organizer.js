import { Router } from 'express';
import { ethers } from 'ethers';
import { z } from 'zod';
import { OrganizerApplication } from '../models/OrganizerApplication.js';
import { isOrganizer } from '../config/chain.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { wrap, parse } from '../middleware/util.js';

const router = Router();

const applySchema = z
  .object({
    organizationName: z.string().trim().min(2).max(100),
    description: z.string().max(1000).optional(),
    contactEmail: z.string().trim().email().max(120),
  })
  .strict();

// Buyer mengajukan diri jadi EO
router.post('/apply', requireAuth, wrap(async (req, res) => {
  const data = parse(applySchema, req.body, res);
  if (!data) return;
  if (await isOrganizer(req.user.address)) {
    return res.status(409).json({ error: 'Wallet ini sudah menjadi Event Organizer' });
  }
  // Keputusan Admin yang sudah "approved" tidak boleh direset jadi "pending" oleh pemohon.
  const existing = await OrganizerApplication.findOne({ address: req.user.address });
  if (existing?.status === 'approved') {
    return res.status(409).json({ error: 'Pengajuan sudah disetujui, tunggu role diberikan Admin' });
  }
  const application = await OrganizerApplication.findOneAndUpdate(
    { address: req.user.address },
    { $set: { ...data, status: 'pending' } },
    { new: true, upsert: true }
  );
  res.status(201).json(application);
}));

// Pemohon melihat status pengajuannya sendiri
router.get('/me', requireAuth, wrap(async (req, res) => {
  const application = await OrganizerApplication.findOne({ address: req.user.address });
  if (!application) return res.status(404).json({ error: 'Belum ada pengajuan' });
  res.json(application);
}));

// Admin melihat daftar pengajuan
router.get('/applications', requireAuth, requireAdmin, wrap(async (req, res) => {
  const q = parse(
    z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }).strict(),
    req.query,
    res
  );
  if (!q) return;
  res.json(await OrganizerApplication.find(q.status ? { status: q.status } : {}).sort({ createdAt: -1 }));
}));

// Admin menandai status di database. Pemberian role yang sebenarnya terjadi
// on-chain lewat grantRole(ORGANIZER_ROLE, address) yang dipanggil dari frontend Admin.
router.patch('/applications/:address', requireAuth, requireAdmin, wrap(async (req, res) => {
  const p = parse(
    z.object({ address: z.string().refine((a) => ethers.isAddress(a), 'Alamat tidak valid') }).strict(),
    req.params,
    res
  );
  if (!p) return;
  const b = parse(z.object({ status: z.enum(['approved', 'rejected']) }).strict(), req.body, res);
  if (!b) return;
  const application = await OrganizerApplication.findOneAndUpdate(
    { address: p.address.toLowerCase() },
    { $set: { status: b.status } },
    { new: true }
  );
  if (!application) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
  res.json(application);
}));

export default router;
