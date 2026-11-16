# TiketKu Backend

Express + MongoDB. Tugasnya: login wallet (nonce + tanda tangan, lalu JWT), CRUD profil user,
CRUD detail event (off-chain), upload poster, dan pengajuan Event Organizer.
Role selalu dibaca dari smart contract, bukan dari database.

## Endpoint

| Method | Endpoint | Akses |
|---|---|---|
| GET | `/health` | Publik |
| GET | `/auth/nonce?address=0x..` | Publik |
| POST | `/auth/verify` `{address, nonce, signature}` | Publik |
| GET | `/auth/me` | Login (mengembalikan role dari kontrak) |
| GET / PUT / DELETE | `/users/me` | Login |
| GET | `/events/:id/details` | Publik |
| PUT / DELETE | `/events/:id/details` | EO pemilik event (dicek ke kontrak) |
| POST | `/upload/poster` (form-data, field `poster`) | EO |
| POST | `/organizer/apply` | Login |
| GET | `/organizer/me` | Login (status pengajuan sendiri) |
| GET | `/organizer/applications?status=pending` | Admin |
| PATCH | `/organizer/applications/:address` `{status}` | Admin |

## Menjalankan

```bash
cd backend
npm install
cp .env.example .env      # Windows CMD: copy .env.example .env
# isi .env (lihat bawah), lalu:
npm run dev
```

Di terminal lain, setelah server hidup:

```bash
npm run test:login
```

## Isi `.env`

| Variabel | Dari mana |
|---|---|
| `MONGODB_URI` | MongoDB Atlas, Connect, Drivers, salin connection string |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `RPC_URL` | Alchemy atau Infura (Sepolia), atau `http://127.0.0.1:8545` untuk Hardhat lokal |
| `CHAIN_ID` | `11155111` (Sepolia) atau `31337` (Hardhat lokal) |
| `CONTRACT_ADDRESS` | Alamat kontrak hasil deploy (dari teman yang mengerjakan kontrak) |
| `FRONTEND_ORIGIN` | `http://localhost:3000` |
| `APP_DOMAIN` | `localhost:3000` (domain yang tampil di pesan yang ditandatangani) |
| `TRUST_PROXY` | `0` lokal; `1` jika di-deploy di belakang satu reverse proxy (Render, Railway, Nginx) |

## Format pesan login

Frontend harus menandatangani **persis** string `message` yang dikembalikan `GET /auth/nonce`:

```js
const { nonce, message } = await (await fetch(`${API}/auth/nonce?address=${address}`)).json();
const signature = await signer.signMessage(message);          // ethers v6 + MetaMask
const { token } = await (await fetch(`${API}/auth/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address, nonce, signature }),
})).json();
// kirim token di header: Authorization: Bearer <token>
```

## Catatan keamanan (berguna untuk laporan audit)

- Pesan login format SIWE (EIP-4361): MetaMask memeriksa domain (anti phishing)
- Nonce sekali pakai, kedaluwarsa 5 menit, dihapus atomik saat verifikasi (anti replay & race)
- Satu alamat bisa punya beberapa nonce aktif, jadi orang lain tidak bisa menimpa nonce korban (anti login DoS)
- JWT HS256 dipaksa, issuer/audience dicek, berlaku 1 jam, alamat user hanya dari JWT (anti IDOR)
- Semua input divalidasi zod `.strict()` (anti mass assignment dan NoSQL injection)
- `avatarUrl` hanya `https://` atau path upload lokal (anti stored XSS `javascript:`)
- Upload: maks 2 MB, tipe dicek dari magic bytes, nama file diganti acak, `nosniff`, maks 20 per jam per EO
- Pengajuan EO yang sudah `approved` tidak bisa direset pemohon
- Helmet, CORS dibatasi ke frontend, rate limit umum + `/auth`, `trust proxy` bisa diatur, body JSON maks 10 KB
- Saat start, backend memastikan `RPC_URL` sesuai `CHAIN_ID` dan `CONTRACT_ADDRESS` benar-benar kontrak
- Error server tidak membocorkan detail ke client
- Ubah/hapus detail event mewajibkan role Organizer masih aktif di kontrak
- Poster yang dipasang harus hasil upload akun yang sama (tabel `Upload`)
- Field internal MongoDB (`_id`, `__v`) tidak dikirim ke client
- Server menolak start jika `JWT_SECRET` atau `CONTRACT_ADDRESS` masih nilai contoh
- `npm run test:login` menguji 13 skenario (replay, tanda tangan palsu, JWT `alg=none`, mass assignment, XSS, dll)

## Batasan yang disengaja

- JWT tidak bisa dicabut sebelum kedaluwarsa (1 jam); logout hanya menghapus token di browser.
  Role tetap dicek ulang ke kontrak di setiap request, jadi pencabutan role langsung berlaku.
- File poster yang tidak dipakai tidak dihapus otomatis (dibatasi 20 upload/jam per EO).

- `PATCH /organizer/applications/:address` hanya menandai status di database.
  Pemberian role EO yang sebenarnya dilakukan Admin on-chain lewat `verifyOrganizer()`.
- Backend hanya membaca dari kontrak (`hasRole`, `events`). Tidak ada private key di backend.
