// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title EventTicket - tiket event NFT dengan fitur anti-calo
/// @notice Transfer bebas diblokir; perpindahan tiket hanya lewat resale resmi
///         dengan harga maksimum. Dana pembelian ditahan (escrow) sampai acara
///         selesai, dan pembeli bisa refund jika event dibatalkan.
contract EventTicket is ERC721, AccessControl, ReentrancyGuard, Pausable, EIP712 {
    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");
    bytes32 public constant GATE_ROLE = keccak256("GATE_ROLE");

    /// @dev Tipe data EIP-712 yang ditandatangani pemilik tiket (isi QR code).
    bytes32 public constant CHECKIN_TYPEHASH =
        keccak256("CheckIn(uint256 tokenId,address holder,uint256 deadline)");

    uint16 public constant MIN_RESALE_BPS = 10000;   // 100% harga asli
    uint16 public constant MAX_RESALE_BPS = 11000;   // maksimal 110% harga asli
    uint256 public constant MAX_NAME_LENGTH = 100;   // byte
    uint256 public constant MAX_PER_WALLET_LIMIT = 10;
    uint256 public constant CHECKIN_OPENS_BEFORE = 6 hours;
    uint256 public constant CHECKIN_CLOSES_AFTER = 1 days;
    /// @dev Tanda tangan QR check-in hanya boleh berlaku sependek ini (anti jual-beli QR).
    uint256 public constant MAX_QR_VALIDITY = 10 minutes;
    /// @dev Dana (penjualan primer & resale) baru cair setelah jendela check-in ditutup.
    uint256 public constant CLAIM_DELAY = 1 days;

    struct EventInfo {
        string name;
        address organizer;
        uint256 price;          // harga tiket (wei)
        uint256 maxSupply;
        uint256 sold;
        uint16 maxResaleBps;    // 10000 = 100%
        uint64 eventDate;       // waktu mulai acara (unix)
    }

    struct Ticket {
        uint256 eventId;
        bool used;
    }

    /// @dev Pembayaran resale ditahan sampai acara selesai. Jika event dibatalkan,
    ///      dana dikembalikan ke pembeli resale (bukan ke penjual).
    struct Sale {
        uint256 tokenId;
        address seller;
        address buyer;
        uint256 amount;
        bool settled;
    }

    uint256 public eventCount;
    uint256 public ticketCount;
    mapping(uint256 => EventInfo) public events;
    mapping(uint256 => Ticket) public tickets;
    mapping(uint256 => uint256) public listingPrice; // 0 = tidak dijual
    mapping(address => uint256) public pendingWithdrawals;

    mapping(uint256 => uint256) public maxPerWallet;                    // eventId => batas tiket per wallet
    mapping(uint256 => mapping(address => uint256)) public heldCount;   // eventId => wallet => jumlah tiket dipegang
    mapping(uint256 => bool) public cancelled;
    mapping(uint256 => uint256) public escrow;                          // dana penjualan primer yang ditahan
    mapping(uint256 => bool) public revenueClaimed;
    mapping(uint256 => mapping(address => bool)) public eventGate;      // petugas gate yang ditugaskan per event
    mapping(uint256 => address) public primaryBuyer;                    // pembeli pertama (penerima refund harga asli)
    mapping(uint256 => bool) public refunded;
    uint256 public saleCount;
    mapping(uint256 => Sale) public sales;

    bool private _moveAllowed;

    error TransferRestricted();
    error InvalidParams();
    error EventNotFound();
    error SoldOut();
    error WrongPayment();
    error AlreadyUsed();
    error NotTicketOwner();
    error PriceAboveCap();
    error NotListed();
    error NothingToWithdraw();
    error TransferFailed();
    error NotEventOwner();
    error EventHasSales();
    error WalletLimitReached();
    error EventEnded();
    error EventIsCancelled();
    error EventNotCancelled();
    error CancelWindowClosed();
    error ClaimNotOpen();
    error AlreadyClaimed();
    error NotAssignedGate();
    error CheckInClosed();
    error SignatureExpired();
    error InvalidSignature();
    error SelfPurchase();
    error NotPrimaryBuyer();
    error AlreadyRefunded();
    error SaleNotFound();
    error AlreadySettled();
    error SettleNotOpen();
    error DeadlineTooFar();
    error AdminRoleProtected();

    event EventCreated(uint256 indexed eventId, address indexed organizer, uint256 price, uint256 maxSupply);
    event TicketPurchased(uint256 indexed eventId, uint256 indexed tokenId, address indexed buyer);
    event TicketListed(uint256 indexed tokenId, uint256 price);
    event ListingCancelled(uint256 indexed tokenId);
    event TicketResold(uint256 indexed tokenId, address indexed from, address indexed to, uint256 price);
    event CheckedIn(uint256 indexed tokenId, address indexed attendee);
    event Withdrawn(address indexed account, uint256 amount);
    event EventUpdated(
        uint256 indexed eventId,
        string name,
        uint256 price,
        uint256 maxSupply,
        uint16 maxResaleBps,
        uint64 eventDate,
        uint256 perWallet
    );
    event EventDeleted(uint256 indexed eventId, address indexed deletedBy);
    event EventCancelled(uint256 indexed eventId, address indexed cancelledBy);
    event Refunded(uint256 indexed tokenId, address indexed holder, uint256 amount);
    event RevenueClaimed(uint256 indexed eventId, address indexed organizer, uint256 amount);
    event GateUpdated(uint256 indexed eventId, address indexed gate, bool allowed);
    event ResaleRecorded(uint256 indexed saleId, uint256 indexed tokenId, address indexed seller, address buyer, uint256 amount);
    event SaleSettled(uint256 indexed saleId, address indexed to, uint256 amount, bool refundedToBuyer);

    constructor() ERC721("EventTicket", "ETKT") EIP712("TiketKu", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ---------- Admin ----------
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // ---------- Organizer: CRUD event ----------
    function _validate(
        string calldata name,
        uint256 price,
        uint256 maxSupply,
        uint16 maxResaleBps,
        uint64 eventDate,
        uint256 perWallet
    ) private view {
        uint256 len = bytes(name).length;
        if (
            len == 0 || len > MAX_NAME_LENGTH || price == 0 || maxSupply == 0 ||
            maxResaleBps < MIN_RESALE_BPS || maxResaleBps > MAX_RESALE_BPS ||
            eventDate <= block.timestamp ||
            perWallet == 0 || perWallet > MAX_PER_WALLET_LIMIT
        ) revert InvalidParams();
    }

    /// @dev Pemilik event DAN masih memegang ORGANIZER_ROLE. Organizer yang role-nya
    ///      dicabut admin tidak bisa lagi mengatur event, gate, atau mengklaim dana.
    function _ownedEvent(uint256 eventId) private view returns (EventInfo storage ev) {
        if (!hasRole(ORGANIZER_ROLE, msg.sender)) revert NotEventOwner();
        ev = events[eventId];
        if (ev.organizer == address(0)) revert EventNotFound();
        if (ev.organizer != msg.sender) revert NotEventOwner();
    }

    function createEvent(
        string calldata name,
        uint256 price,
        uint256 maxSupply,
        uint16 maxResaleBps,
        uint64 eventDate,
        uint256 perWallet
    ) external onlyRole(ORGANIZER_ROLE) whenNotPaused returns (uint256 eventId) {
        _validate(name, price, maxSupply, maxResaleBps, eventDate, perWallet);
        eventId = ++eventCount;
        events[eventId] = EventInfo(name, msg.sender, price, maxSupply, 0, maxResaleBps, eventDate);
        maxPerWallet[eventId] = perWallet;
        emit EventCreated(eventId, msg.sender, price, maxSupply);
    }

    /// @notice UPDATE on-chain. Hanya selama belum ada tiket terjual, supaya
    ///         harga/batas resale tidak bisa diubah setelah ada pembeli.
    function updateEvent(
        uint256 eventId,
        string calldata name,
        uint256 price,
        uint256 maxSupply,
        uint16 maxResaleBps,
        uint64 eventDate,
        uint256 perWallet
    ) external onlyRole(ORGANIZER_ROLE) whenNotPaused {
        EventInfo storage ev = _ownedEvent(eventId);
        if (cancelled[eventId]) revert EventIsCancelled();
        if (ev.sold != 0) revert EventHasSales();
        _validate(name, price, maxSupply, maxResaleBps, eventDate, perWallet);

        ev.name = name;
        ev.price = price;
        ev.maxSupply = maxSupply;
        ev.maxResaleBps = maxResaleBps;
        ev.eventDate = eventDate;
        maxPerWallet[eventId] = perWallet;
        emit EventUpdated(eventId, name, price, maxSupply, maxResaleBps, eventDate, perWallet);
    }

    /// @notice DELETE on-chain: hapus event yang belum punya tiket terjual.
    ///         Boleh organizer pemilik event, atau admin (moderasi).
    function deleteEvent(uint256 eventId) external {
        EventInfo storage ev = events[eventId];
        if (ev.organizer == address(0)) revert EventNotFound();
        bool isOwner = ev.organizer == msg.sender && hasRole(ORGANIZER_ROLE, msg.sender);
        if (!isOwner && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotEventOwner();
        if (ev.sold != 0) revert EventHasSales();

        delete events[eventId];
        delete maxPerWallet[eventId];
        delete cancelled[eventId];
        emit EventDeleted(eventId, msg.sender);
    }

    /// @notice Batalkan event. Pembeli lalu bisa refund() / settleSale().
    ///         Normalnya hanya sebelum jendela check-in dibuka, sehingga pendapatan
    ///         event yang sudah berlangsung tidak bisa dihapus admin.
    ///         Pengecualian: jika role organizer sudah dicabut admin (mis. penipuan),
    ///         admin boleh membatalkan selama dana belum diklaim, supaya escrow
    ///         tidak terkunci selamanya. Tiket yang sudah dipakai tidak di-refund.
    function cancelEvent(uint256 eventId) external {
        EventInfo storage ev = events[eventId];
        if (ev.organizer == address(0)) revert EventNotFound();
        if (cancelled[eventId]) revert EventIsCancelled();
        if (revenueClaimed[eventId]) revert AlreadyClaimed();
        bool isOwner = ev.organizer == msg.sender && hasRole(ORGANIZER_ROLE, msg.sender);
        bool isAdmin = hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
        if (!isOwner && !isAdmin) revert NotEventOwner();
        bool beforeCheckIn = block.timestamp + CHECKIN_OPENS_BEFORE < ev.eventDate;
        bool organizerRevoked = !hasRole(ORGANIZER_ROLE, ev.organizer);
        if (!beforeCheckIn && !(isAdmin && organizerRevoked)) revert CancelWindowClosed();

        cancelled[eventId] = true;
        emit EventCancelled(eventId, msg.sender);
    }

    /// @notice Organizer menugaskan / mencabut petugas gate untuk event miliknya.
    function setEventGate(uint256 eventId, address gate, bool allowed) external {
        _ownedEvent(eventId);
        if (allowed && !hasRole(GATE_ROLE, gate)) revert InvalidParams();
        eventGate[eventId][gate] = allowed;
        emit GateUpdated(eventId, gate, allowed);
    }

    /// @notice Organizer mengklaim hasil penjualan setelah acara + CLAIM_DELAY.
    function claimRevenue(uint256 eventId) external {
        _ownedEvent(eventId);
        if (cancelled[eventId]) revert EventIsCancelled();
        if (revenueClaimed[eventId]) revert AlreadyClaimed();
        if (block.timestamp < uint256(events[eventId].eventDate) + CLAIM_DELAY) revert ClaimNotOpen();

        revenueClaimed[eventId] = true;
        uint256 amount = escrow[eventId];
        escrow[eventId] = 0;
        pendingWithdrawals[msg.sender] += amount;
        emit RevenueClaimed(eventId, msg.sender, amount);
    }

    // ---------- Buyer: pembelian primer ----------
    function _requireOnSale(uint256 eventId, EventInfo storage ev) private view {
        if (ev.organizer == address(0)) revert EventNotFound();
        if (cancelled[eventId]) revert EventIsCancelled();
        if (block.timestamp >= ev.eventDate) revert EventEnded();
    }

    function buyTicket(uint256 eventId) external payable nonReentrant whenNotPaused returns (uint256 tokenId) {
        EventInfo storage ev = events[eventId];
        _requireOnSale(eventId, ev);
        if (ev.sold >= ev.maxSupply) revert SoldOut();
        if (msg.value != ev.price) revert WrongPayment();
        if (heldCount[eventId][msg.sender] >= maxPerWallet[eventId]) revert WalletLimitReached();

        ev.sold++;
        escrow[eventId] += msg.value;
        tokenId = ++ticketCount;
        tickets[tokenId] = Ticket(eventId, false);
        primaryBuyer[tokenId] = msg.sender;

        _mint(msg.sender, tokenId);
        emit TicketPurchased(eventId, tokenId, msg.sender);
    }

    // ---------- Resale terkontrol ----------
    function maxResalePrice(uint256 tokenId) public view returns (uint256) {
        EventInfo storage ev = events[tickets[tokenId].eventId];
        return (ev.price * ev.maxResaleBps) / 10000;
    }

    function listForResale(uint256 tokenId, uint256 price) external whenNotPaused {
        if (ownerOf(tokenId) != msg.sender) revert NotTicketOwner();
        uint256 eventId = tickets[tokenId].eventId;
        _requireOnSale(eventId, events[eventId]);
        if (tickets[tokenId].used) revert AlreadyUsed();
        if (price == 0) revert InvalidParams();
        if (price > maxResalePrice(tokenId)) revert PriceAboveCap();

        listingPrice[tokenId] = price;
        emit TicketListed(tokenId, price);
    }

    function cancelListing(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTicketOwner();
        if (listingPrice[tokenId] == 0) revert NotListed();
        delete listingPrice[tokenId];
        emit ListingCancelled(tokenId);
    }

    function buyResale(uint256 tokenId) external payable nonReentrant whenNotPaused {
        uint256 price = listingPrice[tokenId];
        if (price == 0) revert NotListed();
        if (msg.value != price) revert WrongPayment();

        uint256 eventId = tickets[tokenId].eventId;
        _requireOnSale(eventId, events[eventId]);
        address seller = ownerOf(tokenId);
        if (seller == msg.sender) revert SelfPurchase();
        if (heldCount[eventId][msg.sender] >= maxPerWallet[eventId]) revert WalletLimitReached();

        // Dana resale ditahan; cair ke penjual setelah acara, atau kembali ke pembeli jika batal.
        uint256 saleId = ++saleCount;
        sales[saleId] = Sale(tokenId, seller, msg.sender, msg.value, false);
        _move(seller, msg.sender, tokenId);
        emit ResaleRecorded(saleId, tokenId, seller, msg.sender, msg.value);
        emit TicketResold(tokenId, seller, msg.sender, price);
    }

    // ---------- Check-in ----------
    /// @notice Gate memindai QR berisi tanda tangan EIP-712 pemilik tiket.
    ///         Tanpa tanda tangan pemilik, gate tidak bisa menandai tiket terpakai.
    function checkIn(uint256 tokenId, uint256 deadline, bytes calldata signature)
        external
        onlyRole(GATE_ROLE)
        whenNotPaused
    {
        address holder = ownerOf(tokenId); // revert jika tiket tidak ada
        Ticket storage t = tickets[tokenId];
        EventInfo storage ev = events[t.eventId];

        if (!eventGate[t.eventId][msg.sender]) revert NotAssignedGate();
        if (cancelled[t.eventId]) revert EventIsCancelled();
        if (
            block.timestamp + CHECKIN_OPENS_BEFORE < ev.eventDate ||
            block.timestamp > uint256(ev.eventDate) + CHECKIN_CLOSES_AFTER
        ) revert CheckInClosed();
        if (t.used) revert AlreadyUsed();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (deadline > block.timestamp + MAX_QR_VALIDITY) revert DeadlineTooFar();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CHECKIN_TYPEHASH, tokenId, holder, deadline)));
        if (!SignatureChecker.isValidSignatureNow(holder, digest, signature)) revert InvalidSignature();

        t.used = true;
        delete listingPrice[tokenId];
        emit CheckedIn(tokenId, holder);
    }

    /// @notice Domain separator EIP-712, untuk membangun tanda tangan di frontend.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ---------- Refund (event dibatalkan) ----------
    /// @notice Setiap pembayaran dikembalikan ke yang membayarnya:
    ///         harga asli ke pembeli pertama (refund), dan pembayaran resale ke
    ///         pembeli resale (settleSale). Tidak ada pihak yang rugi atau untung.
    function refund(uint256 tokenId) external nonReentrant {
        if (primaryBuyer[tokenId] != msg.sender) revert NotPrimaryBuyer();
        uint256 eventId = tickets[tokenId].eventId;
        if (!cancelled[eventId]) revert EventNotCancelled();
        if (refunded[tokenId]) revert AlreadyRefunded();
        // Tiket yang sudah dipakai masuk acara tidak di-refund.
        if (tickets[tokenId].used) revert AlreadyUsed();

        refunded[tokenId] = true;
        uint256 amount = events[eventId].price;
        escrow[eventId] -= amount;
        pendingWithdrawals[msg.sender] += amount;
        address holder = _ownerOf(tokenId);
        if (holder != address(0)) _move(holder, address(0), tokenId);
        emit Refunded(tokenId, msg.sender, amount);
    }

    /// @notice Cairkan dana resale yang ditahan. Siapa pun boleh memanggil;
    ///         dana selalu masuk ke pihak yang berhak.
    function settleSale(uint256 saleId) external nonReentrant {
        Sale storage s = sales[saleId];
        if (s.seller == address(0)) revert SaleNotFound();
        if (s.settled) revert AlreadySettled();
        uint256 eventId = tickets[s.tokenId].eventId;

        address to;
        // Jika event batal, pembayaran resale kembali ke pembeli, kecuali tiketnya
        // sudah dipakai (layanan sudah diterima, transaksi tetap berlaku).
        bool toBuyer = cancelled[eventId] && !tickets[s.tokenId].used;
        if (toBuyer) {
            to = s.buyer;
        } else {
            if (block.timestamp < uint256(events[eventId].eventDate) + CLAIM_DELAY) revert SettleNotOpen();
            to = s.seller;
        }
        s.settled = true;
        pendingWithdrawals[to] += s.amount;
        emit SaleSettled(saleId, to, s.amount, toBuyer);
    }

    // ---------- Penarikan dana (pull payment) ----------
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ---------- INTI ANTI-CALO ----------
    /// @dev Satu-satunya jalur perpindahan tiket yang sudah ada (resale & refund/burn).
    ///      Sengaja memakai _update tanpa callback onERC721Received agar tidak ada
    ///      eksekusi kode eksternal saat _moveAllowed = true.
    function _move(address from, address to, uint256 tokenId) private {
        _moveAllowed = true;
        _update(to, tokenId, from);
        _moveAllowed = false;
    }

    /// @dev Hanya mint (from == 0) atau _move yang lolos.
    ///      transferFrom / safeTransferFrom biasa selalu revert.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && !_moveAllowed) revert TransferRestricted();

        uint256 eventId = tickets[tokenId].eventId;
        if (from != address(0)) {
            heldCount[eventId][from]--;
            delete listingPrice[tokenId];
        }
        if (to != address(0)) heldCount[eventId][to]++;

        return super._update(to, tokenId, auth);
    }

    /// @dev Transfer bebas diblokir, jadi approval juga ditolak. Tanpa ini wallet
    ///      dan marketplace mengira tiket bisa dipindah lewat approval.
    function approve(address, uint256) public pure override {
        revert TransferRestricted();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert TransferRestricted();
    }

    /// @dev Admin tidak boleh melepas/mencabut role admin miliknya sendiri,
    ///      supaya kontrak tidak pernah kehilangan admin (pause, moderasi).
    function renounceRole(bytes32 role, address callerConfirmation) public override {
        if (role == DEFAULT_ADMIN_ROLE) revert AdminRoleProtected();
        super.renounceRole(role, callerConfirmation);
    }

    function revokeRole(bytes32 role, address account) public override {
        if (role == DEFAULT_ADMIN_ROLE && account == msg.sender) revert AdminRoleProtected();
        super.revokeRole(role, account);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
