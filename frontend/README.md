# TiketKu Frontend

Next.js 14 (App Router) + ethers v6. Pola UI/UX mengikuti platform tiket Indonesia
(Tiket.com, Traveloka Xperience, Blibli Tiket): hero + kotak pencarian, kartu event
visual dengan harga "Mulai dari", halaman detail dengan kartu pemesanan sticky,
checkout 3 langkah dengan stepper, dan "Tiket Saya" bertab (Aktif / Dijual / Selesai / Dibatalkan).

## Halaman

| Route | Role | Isi |
|---|---|---|
| `/` | Publik | Hero, pencarian, rail "Segera berlangsung", "Paling laris", "Hampir habis" |
| `/explore` | Publik | Filter (kata kunci, status, lokasi, waktu) + urutkan |
| `/events/[id]` | Publik | Detail, aturan tiket, daftar resale, kartu pemesanan |
| `/checkout/[id]` | Login | Detail pesanan → Pembayaran → E-tiket |
| `/orders` | Login | E-tiket QR (EIP-712, 5 menit), jual ulang, batal jual, refund, tarik saldo |
| `/profile` | Login | CRUD profil off-chain, hapus data, ajukan jadi EO |
| `/organizer` | Organizer | KPI, daftar event, edit, petugas gate, batalkan/hapus, klaim pendapatan |
| `/organizer/events/new`, `/organizer/events/[id]` | Organizer | Form event (on-chain + off-chain + poster) |
| `/gate` | Gate | Pilih event, scan kamera / tempel QR, verifikasi, check-in |
| `/admin` | Admin | Ringkasan + jeda darurat, pengajuan EO, kelola role, moderasi event |
| `/help` | Publik | FAQ aturan |

## Menjalankan

```bash
cd frontend
cp .env.local.example .env.local   # isi alamat kontrak, API, chain, RPC
npm install
npm run dev                        # http://localhost:3000
```

MetaMask untuk Hardhat lokal: tambahkan jaringan `http://127.0.0.1:8545` (chain 31337) dan
import private key akun Hardhat (dari output `npx hardhat node`).

## Keamanan sisi frontend

- Token JWT di memori + `sessionStorage` (bukan `localStorage`), dicek ulang terhadap akun wallet aktif.
- Tidak ada `dangerouslySetInnerHTML`; URL poster/avatar divalidasi ulang sebelum dirender.
- Isi QR yang dipindai divalidasi ketat (`parseQr`) sebelum dipakai.
- Harga selalu dibaca ulang dari kontrak tepat sebelum transaksi.
- Header keamanan: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Guard halaman hanya untuk UX; otorisasi sebenarnya tetap di smart contract dan backend.
