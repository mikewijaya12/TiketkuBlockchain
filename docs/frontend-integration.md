# Panduan integrasi frontend

Dokumen ini untuk yang mengerjakan frontend. Kontrak dan backend sudah diperketat; beberapa
signature fungsi berubah dari versi awal.

ABI dan alamat kontrak: `ticket-chain/deployments/<network>.json` dan
`ticket-chain/deployments/EventTicket.abi.json` (dibuat oleh `npm run deploy:local` / `deploy:sepolia`).

## 1. Login wallet (backend)

`POST /auth/verify` sekarang **wajib** mengirim `nonce`.

```js
const { nonce, message } = await (await fetch(`${API}/auth/nonce?address=${address}`)).json();
const signature = await signer.signMessage(message);
const { token } = await (await fetch(`${API}/auth/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address, nonce, signature }),
})).json();
// header berikutnya: Authorization: Bearer <token>   (berlaku 1 jam)
```

Simpan token di memori (state/context) atau `sessionStorage`, jangan di `localStorage`.
Setelah login, ambil role dari `GET /auth/me`.

## 2. Perubahan fungsi kontrak

| Fungsi | Perubahan |
|---|---|
| `createEvent(name, price, maxSupply, maxResaleBps, eventDate, perWallet)` | Parameter baru `perWallet` (1 s.d. 10). `maxResaleBps` harus 10000 s.d. 11000. `name` maks 100 byte. |
| `updateEvent(eventId, name, price, maxSupply, maxResaleBps, eventDate, perWallet)` | Parameter baru `perWallet`. |
| `checkIn(tokenId, deadline, signature)` | Wajib tanda tangan EIP-712 pemilik tiket (lihat bagian 3). |
| `setEventGate(eventId, gate, allowed)` | **Baru.** Organizer menugaskan petugas gate (yang sudah punya `GATE_ROLE`) ke event-nya. |
| `cancelEvent(eventId)` | **Baru.** Organizer atau Admin, hanya sampai 6 jam sebelum acara. |
| `refund(tokenId)` | **Baru.** Pembeli pertama (`primaryBuyer`) tiket event yang dibatalkan menerima harga asli; tiket dibakar. Lalu `withdraw()`. |
| `settleSale(saleId)` | **Baru.** Cairkan dana resale yang ditahan: ke penjual 1 hari setelah acara, atau kembali ke pembeli resale jika event batal. Siapa pun boleh memanggil. |
| `claimRevenue(eventId)` | **Baru.** Organizer (role masih aktif) klaim hasil penjualan ≥ 1 hari setelah `eventDate`, lalu `withdraw()`. |
| `pause()` / `unpause()` | **Baru.** Admin saja. |

View yang berguna: `events(id)`, `maxPerWallet(id)`, `heldCount(id, addr)`, `cancelled(id)`,
`escrow(id)`, `revenueClaimed(id)`, `eventGate(id, addr)`, `primaryBuyer(tokenId)`, `refunded(tokenId)`, `sales(saleId)`, `saleCount()`, `listingPrice(tokenId)`,
`maxResalePrice(tokenId)`, `pendingWithdrawals(addr)`, `tickets(tokenId)`.

Pesan error kontrak berupa custom error (`WalletLimitReached`, `EventEnded`, `EventIsCancelled`,
`CheckInClosed`, `NotAssignedGate`, `InvalidSignature`, dll). Dengan ethers v6 nama error bisa
dibaca dari `contract.interface.parseError(err.data)`.

## 3. Alur check-in dengan QR

1. **Pembeli** (halaman "Tiket saya") membuat tanda tangan, lalu menampilkannya sebagai QR:

```js
const { chainId } = await provider.getNetwork();
const domain = { name: 'TiketKu', version: '1', chainId, verifyingContract: CONTRACT_ADDRESS };
const types = { CheckIn: [
  { name: 'tokenId', type: 'uint256' },
  { name: 'holder', type: 'address' },
  { name: 'deadline', type: 'uint256' },
] };
const deadline = Math.floor(Date.now() / 1000) + 5 * 60; // QR berlaku 5 menit
const signature = await signer.signTypedData(domain, types, { tokenId, holder: address, deadline });
const qrPayload = JSON.stringify({ tokenId, deadline, signature });
```

2. **Gate staff** memindai QR lalu mengirim transaksi:

```js
const { tokenId, deadline, signature } = JSON.parse(scanned);
await contract.checkIn(tokenId, deadline, signature);
```

`deadline` QR maksimal 10 menit dari waktu check-in (`MAX_QR_VALIDITY`). Check-in hanya bisa 6 jam sebelum s.d. 1 hari setelah `eventDate`, dan hanya oleh gate yang
ditugaskan lewat `setEventGate`. Untuk demo, buat event dengan `eventDate` beberapa menit/jam ke depan.

## 4. Data off-chain

- `PUT /users/me` — `avatarUrl` hanya boleh `https://...` atau `/uploads/<hash>.<ext>`.
- `PUT /events/:id/details` — hanya organizer pemilik event (dicek ke kontrak).
- `POST /upload/poster` — form-data field `poster`, JPG/PNG/WEBP ≤ 2 MB, maks 20 per jam.
- Render teks dari user (nama, deskripsi, lokasi) sebagai teks biasa. **Jangan** pakai
  `dangerouslySetInnerHTML`.
