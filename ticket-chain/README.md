# Ticket Chain (Hardhat)

## 1. Setup awal
```bash
npm install
cp .env.example .env     # isi SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY
```
Buka folder di VS Code, lalu install extension yang direkomendasikan (popup muncul otomatis).

## 2. Test
```bash
npx hardhat compile
npm test
npm run coverage
```

## 3. Slither
```bash
pip install slither-analyzer solc-select
solc-select install 0.8.24 && solc-select use 0.8.24
npm run slither
```
Catat tiap temuan di `docs/slither-report.md`: diperbaiki, atau diabaikan + alasan.

## 4. Deploy ke Sepolia
1. Ambil ETH Sepolia dari faucet ke wallet di `PRIVATE_KEY` (wallet khusus testnet!).
2. `npm run deploy:sepolia`
3. Hasil otomatis tersimpan di:
   - `deployments/sepolia.json` -> alamat kontrak (untuk backend & frontend)
   - `deployments/EventTicket.abi.json` -> ABI
4. Verifikasi di Etherscan: `npm run verify:sepolia -- <ALAMAT_KONTRAK>`
5. Setelah deploy, Admin memberi role: `grantRole(ORGANIZER_ROLE, ...)` dan `grantRole(GATE_ROLE, ...)`.
6. Organizer menugaskan gate ke event miliknya: `setEventGate(eventId, gateAddress, true)`.

## 5. Aturan bisnis penting
- `maxResaleBps` 10000-11000 (resale maksimal 110%), `perWallet` 1-10 tiket per wallet per event.
- Penjualan & resale ditutup saat `eventDate`.
- Dana pembelian & resale masuk escrow. Organizer klaim lewat `claimRevenue()` dan penjual resale lewat `settleSale()` mulai `eventDate + 1 hari`, lalu `withdraw()`.
- `cancelEvent()`: organizer atau admin, hanya sampai 6 jam sebelum acara. Pembeli pertama `refund()`, pembeli resale `settleSale()`, lalu `withdraw()`.
- `checkIn(tokenId, deadline, signature)`: tanda tangan EIP-712 pemilik tiket (berlaku maks. 10 menit), 6 jam sebelum s.d. 1 hari setelah acara.
- Organizer yang role-nya dicabut tidak bisa mengatur event/gate atau klaim dana.

Detail untuk frontend: `../docs/frontend-integration.md`.

## Checklist
- [x] Semua test hijau (49 test, termasuk kasus gagal & regression keamanan)
- [x] Slither dijalankan & temuan ditangani (`docs/slither-report.md`)
- [x] `_update` memblokir transfer bebas
- [ ] Deploy Sepolia, alamat + ABI dicatat & dibagikan ke tim backend/frontend
