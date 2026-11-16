import 'dotenv/config';

const need = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Environment variable ${key} wajib diisi (lihat .env.example)`);
  return value;
};

const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

export const env = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: need('MONGODB_URI'),
  jwtSecret: need('JWT_SECRET'),
  rpcUrl: need('RPC_URL'),
  contractAddress: need('CONTRACT_ADDRESS'),
  chainId: Number(process.env.CHAIN_ID) || 11155111,
  frontendOrigin,
  domain: process.env.APP_DOMAIN || new URL(frontendOrigin).host,
  // Jumlah reverse proxy di depan backend (0 = langsung). Penting untuk rate limit per IP.
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  jwtIssuer: 'tiketku-backend',
  jwtAudience: 'tiketku-frontend',
};

if (env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET minimal 32 karakter');
}
// Nilai contoh di .env.example sudah publik di GitHub. Kalau dipakai apa adanya,
// siapa pun bisa memalsukan JWT untuk alamat wallet mana pun (CWE-798).
if (/GANTI|CHANGE_ME|EXAMPLE/i.test(env.jwtSecret)) {
  throw new Error('JWT_SECRET masih nilai contoh, ganti dengan string acak (mis. openssl rand -hex 32)');
}
if (/^0x0{40}$/i.test(env.contractAddress)) {
  throw new Error('CONTRACT_ADDRESS masih alamat nol, isi dengan alamat hasil deploy');
}
