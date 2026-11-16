# Laporan Slither

- Tool: Slither (`slither . --hardhat-ignore-compile --filter-paths node_modules`)
- Kontrak: `contracts/EventTicket.sol` (Solidity 0.8.24, OpenZeppelin 5.0.2)
- Hasil: **7 temuan, semuanya Informational. Tidak ada temuan High / Medium / Low.**

| # | Detector | Lokasi | Severity | Tindakan |
|---|----------|--------|----------|----------|
| 1 | `timestamp` | `_validate()` | Informational | Diterima. `eventDate <= block.timestamp` hanya memastikan event di masa depan; drift timestamp validator (beberapa detik) tidak berdampak. |
| 2 | `timestamp` | `cancelEvent()` | Informational | Diterima. Batas pembatalan = 6 jam sebelum acara (`CHECKIN_OPENS_BEFORE`), jauh di atas toleransi drift. |
| 3 | `timestamp` | `claimRevenue()` | Informational | Diterima. Klaim dibuka 1 hari setelah acara (`CLAIM_DELAY`). |
| 4 | `timestamp` | `settleSale()` | Informational | Diterima. Pencairan dana resale ke penjual memakai batas yang sama dengan `claimRevenue()`. |
| 5 | `timestamp` | `_requireOnSale()` | Informational | Diterima. Menutup penjualan saat acara mulai. |
| 6 | `timestamp` | `checkIn()` | Informational | Diterima. Jendela check-in 6 jam sebelum s.d. 1 hari setelah acara; `deadline` QR maksimal 10 menit (`MAX_QR_VALIDITY`). |
| 7 | `low-level-calls` | `withdraw()` | Informational | Diterima. `call{value:}` sesuai pola pull payment; saldo di-nol-kan sebelum call (checks-effects-interactions), dilindungi `nonReentrant`, hasil call dicek (`TransferFailed`). |

Catatan desain yang sengaja (bukan temuan Slither):

- `_mint` / `_update` dipakai, bukan `_safeMint` / `_safeTransfer`, agar tidak ada callback `onERC721Received` ke kontrak eksternal ketika flag `_moveAllowed` aktif.
- Admin (`DEFAULT_ADMIN_ROLE`) adalah satu akun. Untuk produksi disarankan multisig (mis. Safe).
