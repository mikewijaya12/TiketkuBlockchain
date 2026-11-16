// ABI EventTicket.sol (human-readable, dipakai ethers v6).
// Selaras dengan contracts/EventTicket.sol. Setelah deploy, isi aslinya
// ada di ticket-chain/deployments/EventTicket.abi.json; yang ini cukup
// untuk semua pemanggilan frontend.
export const EVENT_TICKET_ABI = [
  // ----- roles & konstanta -----
  'function ORGANIZER_ROLE() view returns (bytes32)',
  'function GATE_ROLE() view returns (bytes32)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  'function renounceRole(bytes32 role, address callerConfirmation)',

  // ----- counters & data -----
  'function eventCount() view returns (uint256)',
  'function ticketCount() view returns (uint256)',
  'function events(uint256) view returns (string name, address organizer, uint256 price, uint256 maxSupply, uint256 sold, uint16 maxResaleBps, uint64 eventDate)',
  'function tickets(uint256) view returns (uint256 eventId, bool used)',
  'function maxPerWallet(uint256) view returns (uint256)',
  'function heldCount(uint256, address) view returns (uint256)',
  'function cancelled(uint256) view returns (bool)',
  'function escrow(uint256) view returns (uint256)',
  'function revenueClaimed(uint256) view returns (bool)',
  'function eventGate(uint256, address) view returns (bool)',
  'function primaryBuyer(uint256) view returns (address)',
  'function refunded(uint256) view returns (bool)',
  'function saleCount() view returns (uint256)',
  'function sales(uint256) view returns (uint256 tokenId, address seller, address buyer, uint256 amount, bool settled)',
  'function listingPrice(uint256) view returns (uint256)',
  'function maxResalePrice(uint256 tokenId) view returns (uint256)',
  'function pendingWithdrawals(address) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function paused() view returns (bool)',
  'function domainSeparator() view returns (bytes32)',

  // ----- organizer: CRUD event -----
  'function createEvent(string name, uint256 price, uint256 maxSupply, uint16 maxResaleBps, uint64 eventDate, uint256 perWallet) returns (uint256)',
  'function updateEvent(uint256 eventId, string name, uint256 price, uint256 maxSupply, uint16 maxResaleBps, uint64 eventDate, uint256 perWallet)',
  'function deleteEvent(uint256 eventId)',
  'function cancelEvent(uint256 eventId)',
  'function setEventGate(uint256 eventId, address gate, bool allowed)',
  'function claimRevenue(uint256 eventId)',

  // ----- buyer & resale -----
  'function buyTicket(uint256 eventId) payable returns (uint256)',
  'function listForResale(uint256 tokenId, uint256 price)',
  'function cancelListing(uint256 tokenId)',
  'function buyResale(uint256 tokenId) payable',
  'function refund(uint256 tokenId)',
  'function settleSale(uint256 saleId)',

  // ----- check-in -----
  'function checkIn(uint256 tokenId, uint256 deadline, bytes signature)',

  // ----- dana -----
  'function withdraw()',

  // ----- admin -----
  'function pause()',
  'function unpause()',

  // ----- events (log) -----
  'event EventCreated(uint256 indexed eventId, address indexed organizer, uint256 price, uint256 maxSupply)',
  'event TicketPurchased(uint256 indexed eventId, uint256 indexed tokenId, address indexed buyer)',
  'event TicketListed(uint256 indexed tokenId, uint256 price)',
  'event TicketResold(uint256 indexed tokenId, address indexed from, address indexed to, uint256 price)',
  'event CheckedIn(uint256 indexed tokenId, address indexed attendee)',
  'event EventCancelled(uint256 indexed eventId, address indexed cancelledBy)',
  'event Refunded(uint256 indexed tokenId, address indexed holder, uint256 amount)',
  'event ResaleRecorded(uint256 indexed saleId, uint256 indexed tokenId, address indexed seller, address buyer, uint256 amount)',
  'event SaleSettled(uint256 indexed saleId, address indexed to, uint256 amount, bool refundedToBuyer)',
  'event GateUpdated(uint256 indexed eventId, address indexed gate, bool allowed)',
  'event RevenueClaimed(uint256 indexed eventId, address indexed organizer, uint256 amount)',
  'event EventDeleted(uint256 indexed eventId, address indexed deletedBy)',
];

// Custom error EventTicket.sol -> pesan ramah untuk user.
export const CONTRACT_ERRORS: Record<string, string> = {
  TransferRestricted: 'Tiket tidak bisa ditransfer bebas, hanya lewat resale resmi.',
  InvalidParams: 'Data yang dimasukkan tidak valid.',
  EventNotFound: 'Event tidak ditemukan.',
  SoldOut: 'Tiket sudah habis.',
  WrongPayment: 'Jumlah pembayaran tidak sesuai harga.',
  AlreadyUsed: 'Tiket ini sudah dipakai check-in.',
  NotTicketOwner: 'Anda bukan pemilik tiket ini.',
  PriceAboveCap: 'Harga resale melebihi batas maksimum (110%).',
  NotListed: 'Tiket tidak sedang dijual.',
  NothingToWithdraw: 'Tidak ada dana untuk ditarik.',
  TransferFailed: 'Transfer dana gagal.',
  NotEventOwner: 'Anda bukan pemilik event ini.',
  EventHasSales: 'Event sudah ada penjualan, tidak bisa diubah/hapus.',
  WalletLimitReached: 'Anda sudah mencapai batas tiket per wallet.',
  EventEnded: 'Penjualan ditutup karena acara sudah dimulai.',
  EventIsCancelled: 'Event ini sudah dibatalkan.',
  EventNotCancelled: 'Event belum dibatalkan.',
  CancelWindowClosed: 'Event hanya bisa dibatalkan sampai 6 jam sebelum acara.',
  ClaimNotOpen: 'Klaim dana dibuka 1 hari setelah acara.',
  AlreadyClaimed: 'Dana sudah pernah diklaim.',
  NotAssignedGate: 'Anda bukan petugas gate yang ditugaskan untuk event ini.',
  CheckInClosed: 'Check-in belum/tidak dalam jendela waktu.',
  SignatureExpired: 'QR code sudah kedaluwarsa.',
  InvalidSignature: 'Tanda tangan QR tidak valid.',
  SelfPurchase: 'Anda tidak bisa membeli tiket Anda sendiri.',
  NotPrimaryBuyer: 'Refund harga asli hanya untuk pembeli pertama tiket ini.',
  AlreadyRefunded: 'Tiket ini sudah di-refund.',
  SaleNotFound: 'Data penjualan resale tidak ditemukan.',
  AlreadySettled: 'Dana resale ini sudah dicairkan.',
  SettleNotOpen: 'Dana resale cair 1 hari setelah acara selesai.',
  DeadlineTooFar: 'Masa berlaku QR terlalu panjang. Buat QR baru.',
  AdminRoleProtected: 'Admin tidak bisa melepas atau mencabut role admin miliknya sendiri.',
};
