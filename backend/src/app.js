import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import eventRoutes from './routes/events.js';
import uploadRoutes, { uploadDir } from './routes/upload.js';
import organizerRoutes from './routes/organizer.js';

const app = express();

// Di belakang reverse proxy (Render/Railway/Nginx) IP asli ada di X-Forwarded-For.
// Tanpa ini semua user terbaca sebagai IP proxy dan rate limit jadi tidak berguna.
app.set('trust proxy', env.trustProxy);

// cross-origin agar poster bisa dimuat oleh frontend di origin berbeda
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.frontendOrigin }));
app.use(express.json({ limit: '10kb' }));

// Rate limit umum untuk semua endpoint, lebih ketat untuk /auth.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }));

app.use('/uploads', express.static(uploadDir, {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/events', eventRoutes);
app.use('/upload', uploadRoutes);
app.use('/organizer', organizerRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

// Error handler pusat: detail error hanya masuk log server, tidak ke client.
app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File maksimal 2 MB' });
  if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Hanya 1 file dengan field "poster"' });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON tidak valid' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Body terlalu besar' });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan server' });
});

export default app;
