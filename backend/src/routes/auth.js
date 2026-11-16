import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import { z } from 'zod';
import { env } from '../config/env.js';
import { isAdmin, isOrganizer, isGate } from '../config/chain.js';
import { Nonce } from '../models/Nonce.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap, parse } from '../middleware/util.js';

const router = Router();
const addressSchema = z.string().refine((a) => ethers.isAddress(a), 'Alamat wallet tidak valid');
const NONCE_TTL_MS = 5 * 60 * 1000;

// Pesan berformat Sign-In with Ethereum (EIP-4361). Dengan format ini MetaMask
// memeriksa domain dan memperingatkan user jika situs phishing meminta tanda tangan.
const buildMessage = (address, nonce, issuedAt, expiresAt) =>
  `${env.domain} wants you to sign in with your Ethereum account:\n` +
  `${address}\n\n` +
  `Masuk ke TiketKu.\n\n` +
  `URI: ${env.frontendOrigin}\n` +
  `Version: 1\n` +
  `Chain ID: ${env.chainId}\n` +
  `Nonce: ${nonce}\n` +
  `Issued At: ${issuedAt.toISOString()}\n` +
  `Expiration Time: ${expiresAt.toISOString()}`;

// 1) Minta nonce + pesan yang harus ditandatangani
router.get('/nonce', wrap(async (req, res) => {
  const q = parse(z.object({ address: addressSchema }).strict(), req.query, res);
  if (!q) return;
  const address = ethers.getAddress(q.address);
  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
  await Nonce.create({ nonce, address, issuedAt, expiresAt });
  res.json({ nonce, message: buildMessage(address, nonce, issuedAt, expiresAt) });
}));

// 2) Verifikasi tanda tangan, keluarkan JWT
router.post('/verify', wrap(async (req, res) => {
  const body = parse(
    z.object({
      address: addressSchema,
      nonce: z.string().regex(/^[0-9a-f]{32}$/),
      signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
    }).strict(),
    req.body,
    res
  );
  if (!body) return;
  const address = ethers.getAddress(body.address);
  const key = address.toLowerCase();

  // Ambil sekaligus hapus nonce secara atomik: sekali pakai (anti replay) dan
  // dua request paralel dengan tanda tangan yang sama tidak bisa sama-sama lolos.
  const record = await Nonce.findOneAndDelete({
    nonce: body.nonce,
    address: key,
    expiresAt: { $gt: new Date() },
  });
  if (!record) return res.status(401).json({ error: 'Nonce tidak ada atau kedaluwarsa' });

  let recovered;
  try {
    recovered = ethers.verifyMessage(
      buildMessage(address, record.nonce, record.issuedAt, record.expiresAt),
      body.signature
    );
  } catch {
    return res.status(401).json({ error: 'Tanda tangan tidak valid' });
  }
  if (recovered.toLowerCase() !== key) {
    return res.status(401).json({ error: 'Tanda tangan tidak cocok dengan alamat' });
  }

  await User.updateOne({ address: key }, { $setOnInsert: { address: key } }, { upsert: true });
  const token = jwt.sign({}, env.jwtSecret, {
    algorithm: 'HS256',
    subject: key,
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
    expiresIn: '1h',
  });
  res.json({ token, address: key });
}));

// 3) Role aktif user (dibaca dari smart contract)
router.get('/me', requireAuth, wrap(async (req, res) => {
  const [admin, organizer, gate] = await Promise.all([
    isAdmin(req.user.address),
    isOrganizer(req.user.address),
    isGate(req.user.address),
  ]);
  res.json({ address: req.user.address, roles: { admin, organizer, gate, buyer: true } });
}));

export default router;
