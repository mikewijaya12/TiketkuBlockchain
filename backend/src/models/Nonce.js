import mongoose from 'mongoose';

// Satu alamat boleh punya beberapa nonce aktif sekaligus. Kalau nonce disimpan
// satu per alamat, orang lain bisa terus menimpa nonce korban lewat
// GET /auth/nonce?address=<korban> sehingga korban tidak pernah bisa login.
// Dokumen terhapus otomatis oleh MongoDB (TTL) setelah expiresAt lewat.
const nonceSchema = new mongoose.Schema({
  nonce: { type: String, required: true, unique: true },
  address: { type: String, required: true, lowercase: true, index: true },
  issuedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export const Nonce = mongoose.model('Nonce', nonceSchema);
