const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const PRICE = ethers.parseEther("0.1");
const CAP_BPS = 11000; // maksimum resale 110%
const PER_WALLET = 2;
const HOUR = 3600;
const DAY = 24 * HOUR;

async function deployFixture() {
  const [admin, organizer, gate, buyer1, buyer2, stranger, organizer2, gate2] = await ethers.getSigners();
  const ticket = await (await ethers.getContractFactory("EventTicket")).deploy();
  await ticket.grantRole(await ticket.ORGANIZER_ROLE(), organizer.address);
  await ticket.grantRole(await ticket.GATE_ROLE(), gate.address);
  const date = (await time.latest()) + 30 * DAY;
  return { ticket, admin, organizer, gate, buyer1, buyer2, stranger, organizer2, gate2, date };
}

async function eventFixture() {
  const f = await deployFixture();
  await f.ticket.connect(f.organizer).createEvent("Konser A", PRICE, 2, CAP_BPS, f.date, PER_WALLET);
  await f.ticket.connect(f.organizer).setEventGate(1, f.gate.address, true);
  return f;
}

async function boughtFixture() {
  const f = await eventFixture();
  await f.ticket.connect(f.buyer1).buyTicket(1, { value: PRICE });
  return f; // tokenId 1 milik buyer1
}

// Tanda tangan EIP-712 pemilik tiket (isi QR code yang dipindai gate).
async function signCheckIn(ticket, holder, tokenId, deadline) {
  const { chainId } = await ethers.provider.getNetwork();
  const domain = { name: "TiketKu", version: "1", chainId, verifyingContract: await ticket.getAddress() };
  const types = { CheckIn: [
    { name: "tokenId", type: "uint256" },
    { name: "holder", type: "address" },
    { name: "deadline", type: "uint256" },
  ] };
  return holder.signTypedData(domain, types, { tokenId, holder: holder.address, deadline });
}

// Majukan waktu ke jendela check-in (1 jam sebelum acara).
async function openGate(date) {
  await time.increaseTo(date - HOUR);
}

describe("EventTicket", () => {
  describe("createEvent", () => {
    it("organizer bisa membuat event", async () => {
      const { ticket, organizer, date } = await loadFixture(deployFixture);
      await expect(ticket.connect(organizer).createEvent("Konser A", PRICE, 100, CAP_BPS, date, 4))
        .to.emit(ticket, "EventCreated").withArgs(1, organizer.address, PRICE, 100);
      expect(await ticket.maxPerWallet(1)).to.equal(4);
    });
    it("GAGAL: Buyer tidak bisa createEvent", async () => {
      const { ticket, buyer1, date } = await loadFixture(deployFixture);
      await expect(ticket.connect(buyer1).createEvent("X", PRICE, 10, CAP_BPS, date, 1))
        .to.be.revertedWithCustomError(ticket, "AccessControlUnauthorizedAccount");
    });
    it("GAGAL: parameter tidak valid", async () => {
      const { ticket, organizer, date } = await loadFixture(deployFixture);
      const c = ticket.connect(organizer);
      const bad = (args) => expect(c.createEvent(...args)).to.be.revertedWithCustomError(ticket, "InvalidParams");
      await bad(["", PRICE, 10, CAP_BPS, date, 1]);
      await bad(["X".repeat(101), PRICE, 10, CAP_BPS, date, 1]);
      await bad(["X", 0, 10, CAP_BPS, date, 1]);
      await bad(["X", PRICE, 0, CAP_BPS, date, 1]);
      await bad(["X", PRICE, 10, 9000, date, 1]);
      await bad(["X", PRICE, 10, 11001, date, 1]); // resale > 110%
      await bad(["X", PRICE, 10, CAP_BPS, 1, 1]);
      await bad(["X", PRICE, 10, CAP_BPS, date, 0]);
      await bad(["X", PRICE, 10, CAP_BPS, date, 11]);
    });
  });

  describe("updateEvent (UPDATE on-chain)", () => {
    it("organizer pemilik bisa update event yang belum terjual", async () => {
      const { ticket, organizer, date } = await loadFixture(eventFixture);
      const newPrice = ethers.parseEther("0.2");
      await expect(ticket.connect(organizer).updateEvent(1, "Konser B", newPrice, 50, 10500, date + DAY, 3))
        .to.emit(ticket, "EventUpdated").withArgs(1, "Konser B", newPrice, 50, 10500, date + DAY, 3);
      const ev = await ticket.events(1);
      expect(ev.name).to.equal("Konser B");
      expect(ev.price).to.equal(newPrice);
      expect(ev.maxSupply).to.equal(50);
      expect(await ticket.maxPerWallet(1)).to.equal(3);
    });
    it("GAGAL: organizer lain bukan pemilik event", async () => {
      const { ticket, admin, stranger, date } = await loadFixture(eventFixture);
      await ticket.connect(admin).grantRole(await ticket.ORGANIZER_ROLE(), stranger.address);
      await expect(ticket.connect(stranger).updateEvent(1, "Hack", PRICE, 2, CAP_BPS, date, 1))
        .to.be.revertedWithCustomError(ticket, "NotEventOwner");
    });
    it("GAGAL: buyer (tanpa role) tidak bisa update", async () => {
      const { ticket, buyer1, date } = await loadFixture(eventFixture);
      await expect(ticket.connect(buyer1).updateEvent(1, "X", PRICE, 2, CAP_BPS, date, 1)).to.be.reverted;
    });
    it("GAGAL: event sudah ada tiket terjual", async () => {
      const { ticket, organizer, date } = await loadFixture(boughtFixture);
      await expect(ticket.connect(organizer).updateEvent(1, "X", PRICE, 2, CAP_BPS, date, 1))
        .to.be.revertedWithCustomError(ticket, "EventHasSales");
    });
    it("GAGAL: event tidak ada / parameter tidak valid", async () => {
      const { ticket, organizer, date } = await loadFixture(eventFixture);
      await expect(ticket.connect(organizer).updateEvent(99, "X", PRICE, 2, CAP_BPS, date, 1))
        .to.be.revertedWithCustomError(ticket, "EventNotFound");
      await expect(ticket.connect(organizer).updateEvent(1, "", PRICE, 2, CAP_BPS, date, 1))
        .to.be.revertedWithCustomError(ticket, "InvalidParams");
      await expect(ticket.connect(organizer).updateEvent(1, "X", PRICE, 2, 9000, date, 1))
        .to.be.revertedWithCustomError(ticket, "InvalidParams");
    });
  });

  describe("deleteEvent (DELETE on-chain)", () => {
    it("organizer pemilik bisa hapus event yang belum terjual", async () => {
      const { ticket, organizer } = await loadFixture(eventFixture);
      await expect(ticket.connect(organizer).deleteEvent(1))
        .to.emit(ticket, "EventDeleted").withArgs(1, organizer.address);
      expect((await ticket.events(1)).organizer).to.equal(ethers.ZeroAddress);
    });
    it("admin bisa menghapus event (moderasi)", async () => {
      const { ticket, admin } = await loadFixture(eventFixture);
      await expect(ticket.connect(admin).deleteEvent(1)).to.emit(ticket, "EventDeleted");
    });
    it("GAGAL: orang lain tidak bisa menghapus", async () => {
      const { ticket, stranger } = await loadFixture(eventFixture);
      await expect(ticket.connect(stranger).deleteEvent(1))
        .to.be.revertedWithCustomError(ticket, "NotEventOwner");
    });
    it("GAGAL: event sudah ada tiket terjual", async () => {
      const { ticket, organizer } = await loadFixture(boughtFixture);
      await expect(ticket.connect(organizer).deleteEvent(1))
        .to.be.revertedWithCustomError(ticket, "EventHasSales");
    });
    it("GAGAL: hapus dua kali, dan event terhapus tidak bisa dibeli", async () => {
      const { ticket, organizer, buyer1 } = await loadFixture(eventFixture);
      await ticket.connect(organizer).deleteEvent(1);
      await expect(ticket.connect(organizer).deleteEvent(1))
        .to.be.revertedWithCustomError(ticket, "EventNotFound");
      await expect(ticket.connect(buyer1).buyTicket(1, { value: PRICE }))
        .to.be.revertedWithCustomError(ticket, "EventNotFound");
    });
  });

  describe("buyTicket", () => {
    it("buyer bisa membeli dan menerima NFT, dana masuk escrow", async () => {
      const { ticket, buyer1, organizer } = await loadFixture(eventFixture);
      await expect(ticket.connect(buyer1).buyTicket(1, { value: PRICE }))
        .to.emit(ticket, "TicketPurchased").withArgs(1, 1, buyer1.address);
      expect(await ticket.ownerOf(1)).to.equal(buyer1.address);
      expect(await ticket.escrow(1)).to.equal(PRICE);
      expect(await ticket.pendingWithdrawals(organizer.address)).to.equal(0);
    });
    it("GAGAL: pembayaran salah", async () => {
      const { ticket, buyer1 } = await loadFixture(eventFixture);
      await expect(ticket.connect(buyer1).buyTicket(1, { value: PRICE - 1n }))
        .to.be.revertedWithCustomError(ticket, "WrongPayment");
    });
    it("GAGAL: event tidak ada", async () => {
      const { ticket, buyer1 } = await loadFixture(eventFixture);
      await expect(ticket.connect(buyer1).buyTicket(99, { value: PRICE }))
        .to.be.revertedWithCustomError(ticket, "EventNotFound");
    });
    it("GAGAL: tiket habis", async () => {
      const { ticket, buyer1, buyer2, stranger } = await loadFixture(eventFixture);
      await ticket.connect(buyer1).buyTicket(1, { value: PRICE });
      await ticket.connect(buyer2).buyTicket(1, { value: PRICE });
      await expect(ticket.connect(stranger).buyTicket(1, { value: PRICE }))
        .to.be.revertedWithCustomError(ticket, "SoldOut");
    });
  });

  describe("Anti-calo: _update", () => {
    it("GAGAL: transferFrom bebas ditolak", async () => {
      const { ticket, buyer1, buyer2 } = await loadFixture(boughtFixture);
      await expect(ticket.connect(buyer1).transferFrom(buyer1.address, buyer2.address, 1))
        .to.be.revertedWithCustomError(ticket, "TransferRestricted");
    });
    it("GAGAL: safeTransferFrom ditolak", async () => {
      const { ticket, buyer1, buyer2 } = await loadFixture(boughtFixture);
      await expect(
        ticket.connect(buyer1)["safeTransferFrom(address,address,uint256)"](buyer1.address, buyer2.address, 1)
      ).to.be.revertedWithCustomError(ticket, "TransferRestricted");
    });
    it("GAGAL: approve & setApprovalForAll ditolak", async () => {
      const { ticket, buyer1, buyer2, stranger } = await loadFixture(boughtFixture);
      await expect(ticket.connect(buyer1).approve(stranger.address, 1))
        .to.be.revertedWithCustomError(ticket, "TransferRestricted");
      await expect(ticket.connect(buyer1).setApprovalForAll(stranger.address, true))
        .to.be.revertedWithCustomError(ticket, "TransferRestricted");
      await expect(ticket.connect(stranger).transferFrom(buyer1.address, buyer2.address, 1))
        .to.be.reverted;
    });
    it("GAGAL: admin tidak bisa melepas / mencabut role admin sendiri", async () => {
      const { ticket, admin, stranger } = await loadFixture(deployFixture);
      const ADMIN = await ticket.DEFAULT_ADMIN_ROLE();
      await expect(ticket.connect(admin).renounceRole(ADMIN, admin.address)).to.be.revertedWithCustomError(ticket, "AdminRoleProtected");
      await expect(ticket.connect(admin).revokeRole(ADMIN, admin.address)).to.be.revertedWithCustomError(ticket, "AdminRoleProtected");
      // admin lain tetap bisa dicabut, dan role non-admin tetap bisa dilepas
      await ticket.connect(admin).grantRole(ADMIN, stranger.address);
      await ticket.connect(admin).revokeRole(ADMIN, stranger.address);
      const GATE = await ticket.GATE_ROLE();
      await ticket.connect(admin).grantRole(GATE, stranger.address);
      await ticket.connect(stranger).renounceRole(GATE, stranger.address);
      expect(await ticket.hasRole(GATE, stranger.address)).to.equal(false);
    });
  });

  describe("Resale", () => {
    it("listing di batas maksimum diterima & buyResale memindahkan tiket", async () => {
      const { ticket, buyer1, buyer2 } = await loadFixture(boughtFixture);
      const cap = (PRICE * BigInt(CAP_BPS)) / 10000n;
      await expect(ticket.connect(buyer1).listForResale(1, cap)).to.emit(ticket, "TicketListed").withArgs(1, cap);
      await expect(ticket.connect(buyer2).buyResale(1, { value: cap }))
        .to.emit(ticket, "TicketResold").withArgs(1, buyer1.address, buyer2.address, cap);
      expect(await ticket.ownerOf(1)).to.equal(buyer2.address);
      // dana resale ditahan sampai acara selesai
      expect(await ticket.pendingWithdrawals(buyer1.address)).to.equal(0);
      const sale = await ticket.sales(1);
      expect(sale.seller).to.equal(buyer1.address);
      expect(sale.buyer).to.equal(buyer2.address);
      expect(sale.amount).to.equal(cap);
      expect(await ticket.heldCount(1, buyer1.address)).to.equal(0);
      expect(await ticket.heldCount(1, buyer2.address)).to.equal(1);
      expect(await ticket.listingPrice(1)).to.equal(0);
    });
    it("GAGAL: resale di atas batas ditolak", async () => {
      const { ticket, buyer1 } = await loadFixture(boughtFixture);
      const cap = (PRICE * BigInt(CAP_BPS)) / 10000n;
      await expect(ticket.connect(buyer1).listForResale(1, cap + 1n))
        .to.be.revertedWithCustomError(ticket, "PriceAboveCap");
    });
    it("GAGAL: non-owner tidak bisa listing", async () => {
      const { ticket, buyer2 } = await loadFixture(boughtFixture);
      await expect(ticket.connect(buyer2).listForResale(1, PRICE))
        .to.be.revertedWithCustomError(ticket, "NotTicketOwner");
    });
    it("GAGAL: buyResale tanpa listing / salah bayar / beli milik sendiri", async () => {
      const { ticket, buyer1, buyer2 } = await loadFixture(boughtFixture);
      await expect(ticket.connect(buyer2).buyResale(1, { value: PRICE }))
        .to.be.revertedWithCustomError(ticket, "NotListed");
      await ticket.connect(buyer1).listForResale(1, PRICE);
      await expect(ticket.connect(buyer2).buyResale(1, { value: PRICE + 1n }))
        .to.be.revertedWithCustomError(ticket, "WrongPayment");
      await expect(ticket.connect(buyer1).buyResale(1, { value: PRICE }))
        .to.be.revertedWithCustomError(ticket, "SelfPurchase");
    });
    it("settleSale: dana resale cair ke penjual setelah acara + CLAIM_DELAY", async () => {
      const { ticket, buyer1, buyer2, stranger, date } = await loadFixture(boughtFixture);
      await ticket.connect(buyer1).listForResale(1, PRICE);
      await ticket.connect(buyer2).buyResale(1, { value: PRICE });
      await expect(ticket.connect(stranger).settleSale(1)).to.be.revertedWithCustomError(ticket, "SettleNotOpen");
      await time.increaseTo(date + DAY);
      await expect(ticket.connect(stranger).settleSale(1)).to.emit(ticket, "SaleSettled").withArgs(1, buyer1.address, PRICE, false);
      expect(await ticket.pendingWithdrawals(buyer1.address)).to.equal(PRICE);
      await expect(ticket.settleSale(1)).to.be.revertedWithCustomError(ticket, "AlreadySettled");
      await expect(ticket.settleSale(99)).to.be.revertedWithCustomError(ticket, "SaleNotFound");
    });
    it("cancelListing membatalkan penjualan", async () => {
      const { ticket, buyer1, buyer2 } = await loadFixture(boughtFixture);
      await ticket.connect(buyer1).listForResale(1, PRICE);
      await ticket.connect(buyer1).cancelListing(1);
      await expect(ticket.connect(buyer2).buyResale(1, { value: PRICE }))
        .to.be.revertedWithCustomError(ticket, "NotListed");
    });
  });

  describe("checkIn (QR bertanda tangan pemilik)", () => {
    it("gate yang ditugaskan bisa check-in dengan tanda tangan pemilik", async () => {
      const { ticket, gate, buyer1, date } = await loadFixture(boughtFixture);
      await openGate(date);
      const deadline = (await time.latest()) + 300;
      const sig = await signCheckIn(ticket, buyer1, 1, deadline);
      await expect(ticket.connect(gate).checkIn(1, deadline, sig)).to.emit(ticket, "CheckedIn").withArgs(1, buyer1.address);
      expect((await ticket.tickets(1)).used).to.equal(true);
    });
    it("GAGAL: checkIn dua kali ditolak", async () => {
      const { ticket, gate, buyer1, date } = await loadFixture(boughtFixture);
      await openGate(date);
      const deadline = (await time.latest()) + 300;
      const sig = await signCheckIn(ticket, buyer1, 1, deadline);
      await ticket.connect(gate).checkIn(1, deadline, sig);
      await expect(ticket.connect(gate).checkIn(1, deadline, sig)).to.be.revertedWithCustomError(ticket, "AlreadyUsed");
    });
    it("GAGAL: bukan gate / tiket tidak ada", async () => {
      const { ticket, gate, buyer1, date } = await loadFixture(boughtFixture);
      await openGate(date);
      const deadline = (await time.latest()) + 300;
      const sig = await signCheckIn(ticket, buyer1, 1, deadline);
      await expect(ticket.connect(buyer1).checkIn(1, deadline, sig))
        .to.be.revertedWithCustomError(ticket, "AccessControlUnauthorizedAccount");
      await expect(ticket.connect(gate).checkIn(99, deadline, sig)).to.be.reverted;
    });
    it("GAGAL: tiket terpakai tidak bisa dijual ulang", async () => {
      const { ticket, gate, buyer1, date } = await loadFixture(boughtFixture);
      await openGate(date);
      const deadline = (await time.latest()) + 300;
      await ticket.connect(gate).checkIn(1, deadline, await signCheckIn(ticket, buyer1, 1, deadline));
      await expect(ticket.connect(buyer1).listForResale(1, PRICE))
        .to.be.revertedWithCustomError(ticket, "AlreadyUsed");
    });
  });

  describe("Escrow, klaim & withdraw", () => {
    it("organizer baru bisa klaim setelah acara + CLAIM_DELAY", async () => {
      const { ticket, organizer, date } = await loadFixture(boughtFixture);
      await expect(ticket.connect(organizer).claimRevenue(1)).to.be.revertedWithCustomError(ticket, "ClaimNotOpen");
      await time.increaseTo(date + 3 * DAY);
      await expect(ticket.connect(organizer).claimRevenue(1)).to.emit(ticket, "RevenueClaimed").withArgs(1, organizer.address, PRICE);
      await expect(ticket.connect(organizer).withdraw()).to.changeEtherBalance(organizer, PRICE);
      await expect(ticket.connect(organizer).claimRevenue(1)).to.be.revertedWithCustomError(ticket, "AlreadyClaimed");
    });
    it("GAGAL: tidak ada saldo / bukan pemilik event", async () => {
      const { ticket, stranger, date } = await loadFixture(boughtFixture);
      await expect(ticket.connect(stranger).withdraw()).to.be.revertedWithCustomError(ticket, "NothingToWithdraw");
      await time.increaseTo(date + 3 * DAY);
      await expect(ticket.connect(stranger).claimRevenue(1)).to.be.revertedWithCustomError(ticket, "NotEventOwner");
    });
  });

  describe("Pausable", () => {
    it("admin bisa pause; pembelian berhenti, withdraw tetap jalan", async () => {
      const { ticket, admin, buyer1, buyer2 } = await loadFixture(boughtFixture);
      await ticket.connect(admin).pause();
      await expect(ticket.connect(buyer2).buyTicket(1, { value: PRICE })).to.be.revertedWithCustomError(ticket, "EnforcedPause");
      await expect(ticket.connect(buyer1).pause()).to.be.revertedWithCustomError(ticket, "AccessControlUnauthorizedAccount");
      await ticket.connect(admin).unpause();
      await ticket.connect(buyer2).buyTicket(1, { value: PRICE });
    });
  });

  describe("Metadata", () => {
    it("supportsInterface ERC721 & AccessControl, domainSeparator EIP-712", async () => {
      const { ticket } = await loadFixture(deployFixture);
      expect(await ticket.supportsInterface("0x80ac58cd")).to.equal(true); // ERC721
      expect(await ticket.supportsInterface("0x7965db0b")).to.equal(true); // AccessControl
      const { chainId } = await ethers.provider.getNetwork();
      const expected = ethers.TypedDataEncoder.hashDomain({
        name: "TiketKu", version: "1", chainId, verifyingContract: await ticket.getAddress(),
      });
      expect(await ticket.domainSeparator()).to.equal(expected);
    });
  });

  // ===== Regression test untuk temuan audit internal (F-01 .. F-04) =====
  describe("Security regression", () => {
    it("F-01: satu wallet tidak bisa memborong (batas per wallet, termasuk lewat resale)", async () => {
      const { ticket, organizer, buyer1, buyer2, date } = await loadFixture(deployFixture);
      await ticket.connect(organizer).createEvent("Konser", PRICE, 100, CAP_BPS, date, 2);
      await ticket.connect(buyer1).buyTicket(1, { value: PRICE });
      await ticket.connect(buyer1).buyTicket(1, { value: PRICE });
      await expect(ticket.connect(buyer1).buyTicket(1, { value: PRICE }))
        .to.be.revertedWithCustomError(ticket, "WalletLimitReached");
      // tidak bisa menambah tiket lewat resale juga
      await ticket.connect(buyer2).buyTicket(1, { value: PRICE });
      await ticket.connect(buyer2).listForResale(3, PRICE);
      await expect(ticket.connect(buyer1).buyResale(3, { value: PRICE }))
        .to.be.revertedWithCustomError(ticket, "WalletLimitReached");
      // resale maksimal 110%
      await expect(ticket.connect(organizer).createEvent("X", PRICE, 10, 20000, date, 1))
        .to.be.revertedWithCustomError(ticket, "InvalidParams");
    });

    it("F-02: tidak bisa beli / listing / beli resale setelah acara mulai", async () => {
      const { ticket, buyer1, buyer2, date } = await loadFixture(boughtFixture);
      await ticket.connect(buyer1).listForResale(1, PRICE);
      await time.increaseTo(date);
      await expect(ticket.connect(buyer2).buyTicket(1, { value: PRICE })).to.be.revertedWithCustomError(ticket, "EventEnded");
      await expect(ticket.connect(buyer2).buyResale(1, { value: PRICE })).to.be.revertedWithCustomError(ticket, "EventEnded");
      await expect(ticket.connect(buyer1).listForResale(1, PRICE)).to.be.revertedWithCustomError(ticket, "EventEnded");
    });

    it("F-03: event batal -> setiap pembayaran kembali ke pembayarnya (termasuk resale 110%)", async () => {
      const { ticket, organizer, buyer1, buyer2, date } = await loadFixture(boughtFixture);
      const cap = (PRICE * BigInt(CAP_BPS)) / 10000n;
      // buyer1 beli 100%, jual ke buyer2 seharga 110%
      await ticket.connect(buyer1).listForResale(1, cap);
      await ticket.connect(buyer2).buyResale(1, { value: cap });

      await expect(ticket.connect(organizer).withdraw()).to.be.revertedWithCustomError(ticket, "NothingToWithdraw");
      await expect(ticket.connect(organizer).cancelEvent(1)).to.emit(ticket, "EventCancelled");
      await expect(ticket.connect(buyer2).buyTicket(1, { value: PRICE })).to.be.revertedWithCustomError(ticket, "EventIsCancelled");

      // pembeli pertama menerima harga asli, pembeli resale menerima 110% kembali
      await expect(ticket.connect(buyer2).refund(1)).to.be.revertedWithCustomError(ticket, "NotPrimaryBuyer");
      await expect(ticket.connect(buyer1).refund(1)).to.emit(ticket, "Refunded").withArgs(1, buyer1.address, PRICE);
      await expect(ticket.settleSale(1)).to.emit(ticket, "SaleSettled").withArgs(1, buyer2.address, cap, true);
      await expect(ticket.connect(buyer1).withdraw()).to.changeEtherBalance(buyer1, PRICE);
      await expect(ticket.connect(buyer2).withdraw()).to.changeEtherBalance(buyer2, cap);
      await expect(ticket.ownerOf(1)).to.be.revertedWithCustomError(ticket, "ERC721NonexistentToken");
      await expect(ticket.connect(buyer1).refund(1)).to.be.revertedWithCustomError(ticket, "AlreadyRefunded");

      await time.increaseTo(date + 3 * DAY);
      await expect(ticket.connect(organizer).claimRevenue(1)).to.be.revertedWithCustomError(ticket, "EventIsCancelled");
      expect(await ethers.provider.getBalance(await ticket.getAddress())).to.equal(0);
    });

    it("F-03: pembatalan hanya sebelum jendela check-in dibuka (admin juga)", async () => {
      const { ticket, admin, organizer, stranger, date } = await loadFixture(boughtFixture);
      await expect(ticket.connect(stranger).cancelEvent(1)).to.be.revertedWithCustomError(ticket, "NotEventOwner");
      await time.increaseTo(date - 6 * HOUR);
      await expect(ticket.connect(organizer).cancelEvent(1)).to.be.revertedWithCustomError(ticket, "CancelWindowClosed");
      await expect(ticket.connect(admin).cancelEvent(1)).to.be.revertedWithCustomError(ticket, "CancelWindowClosed");
    });

    it("F-04: gate tidak bisa check-in event lain, di luar jendela waktu, atau tanpa tanda tangan pemilik", async () => {
      const { ticket, admin, organizer2, gate, gate2, buyer1, buyer2, date } = await loadFixture(boughtFixture);
      // event B milik organizer2 dengan gate2
      await ticket.connect(admin).grantRole(await ticket.ORGANIZER_ROLE(), organizer2.address);
      await ticket.connect(admin).grantRole(await ticket.GATE_ROLE(), gate2.address);
      await ticket.connect(organizer2).createEvent("Event B", PRICE, 10, CAP_BPS, date, 1);
      await ticket.connect(organizer2).setEventGate(2, gate2.address, true);
      await ticket.connect(buyer2).buyTicket(2, { value: PRICE }); // tokenId 2

      // terlalu awal (seminggu sebelum acara)
      let deadline = (await time.latest()) + 300;
      await expect(ticket.connect(gate).checkIn(1, deadline, await signCheckIn(ticket, buyer1, 1, deadline)))
        .to.be.revertedWithCustomError(ticket, "CheckInClosed");

      await openGate(date);
      deadline = (await time.latest()) + 300;
      // gate event A mencoba check-in tiket event B
      await expect(ticket.connect(gate).checkIn(2, deadline, await signCheckIn(ticket, buyer2, 2, deadline)))
        .to.be.revertedWithCustomError(ticket, "NotAssignedGate");
      // tanda tangan bukan dari pemilik tiket
      await expect(ticket.connect(gate).checkIn(1, deadline, await signCheckIn(ticket, buyer2, 1, deadline)))
        .to.be.revertedWithCustomError(ticket, "InvalidSignature");
      // tanda tangan kedaluwarsa
      const old = (await time.latest()) - 1;
      await expect(ticket.connect(gate).checkIn(1, old, await signCheckIn(ticket, buyer1, 1, old)))
        .to.be.revertedWithCustomError(ticket, "SignatureExpired");
      // hanya organizer pemilik yang bisa menugaskan gate, dan hanya ke akun ber-GATE_ROLE
      await expect(ticket.connect(organizer2).setEventGate(1, gate2.address, true))
        .to.be.revertedWithCustomError(ticket, "NotEventOwner");
    });
  });
});
