// Regression test untuk temuan audit internal putaran ke-2.
// Setiap test memastikan celah yang pernah ditemukan sudah TERTUTUP.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const PRICE = ethers.parseEther("0.1");
const CAP_BPS = 11000;
const HOUR = 3600;
const DAY = 24 * HOUR;

async function fixture() {
  const [admin, organizer, gate, buyer1, buyer2] = await ethers.getSigners();
  const ticket = await (await ethers.getContractFactory("EventTicket")).deploy();
  await ticket.grantRole(await ticket.ORGANIZER_ROLE(), organizer.address);
  await ticket.grantRole(await ticket.GATE_ROLE(), gate.address);
  const date = (await time.latest()) + 30 * DAY;
  await ticket.connect(organizer).createEvent("Konser A", PRICE, 10, CAP_BPS, date, 2);
  await ticket.connect(organizer).setEventGate(1, gate.address, true);
  await ticket.connect(buyer1).buyTicket(1, { value: PRICE }); // tokenId 1
  return { ticket, admin, organizer, gate, buyer1, buyer2, date };
}

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

describe("Security regression (audit internal putaran 2)", () => {
  it("R-01: event tidak bisa dibatalkan setelah check-in dibuka, jadi tiket terpakai tidak bisa di-refund", async () => {
    const { ticket, admin, gate, buyer1, date } = await loadFixture(fixture);
    await time.increaseTo(date - HOUR);
    const deadline = (await time.latest()) + 300;
    await ticket.connect(gate).checkIn(1, deadline, await signCheckIn(ticket, buyer1, 1, deadline));
    await expect(ticket.connect(admin).cancelEvent(1)).to.be.revertedWithCustomError(ticket, "CancelWindowClosed");
    await expect(ticket.connect(buyer1).refund(1)).to.be.revertedWithCustomError(ticket, "EventNotCancelled");
  });

  it("R-02: organizer yang role-nya dicabut tidak bisa klaim dana", async () => {
    const { ticket, admin, organizer, date } = await loadFixture(fixture);
    await ticket.connect(admin).revokeRole(await ticket.ORGANIZER_ROLE(), organizer.address);
    await time.increaseTo(date + 3 * DAY);
    await expect(ticket.connect(organizer).claimRevenue(1)).to.be.revertedWithCustomError(ticket, "NotEventOwner");
  });

  it("R-03: organizer yang role-nya dicabut tidak bisa atur gate, batalkan, atau hapus event", async () => {
    const { ticket, admin, organizer, gate } = await loadFixture(fixture);
    await ticket.connect(admin).revokeRole(await ticket.ORGANIZER_ROLE(), organizer.address);
    await expect(ticket.connect(organizer).setEventGate(1, gate.address, false)).to.be.revertedWithCustomError(ticket, "NotEventOwner");
    await expect(ticket.connect(organizer).cancelEvent(1)).to.be.revertedWithCustomError(ticket, "NotEventOwner");
    await expect(ticket.connect(organizer).deleteEvent(1)).to.be.revertedWithCustomError(ticket, "NotEventOwner");
    // admin tetap bisa membatalkan supaya pembeli bisa refund
    await expect(ticket.connect(admin).cancelEvent(1)).to.emit(ticket, "EventCancelled");
  });

  it("R-03b: organizer dicabut setelah acara -> admin masih bisa batalkan (dana tidak terkunci), tiket terpakai tidak di-refund", async () => {
    const { ticket, admin, organizer, gate, buyer1, buyer2, date } = await loadFixture(fixture);
    await ticket.connect(buyer2).buyTicket(1, { value: PRICE }); // tokenId 2, tidak datang
    await time.increaseTo(date - HOUR);
    const deadline = (await time.latest()) + 300;
    await ticket.connect(gate).checkIn(1, deadline, await signCheckIn(ticket, buyer1, 1, deadline));
    await time.increaseTo(date + 2 * HOUR);
    // organizer masih aktif: admin tidak bisa batalkan
    await expect(ticket.connect(admin).cancelEvent(1)).to.be.revertedWithCustomError(ticket, "CancelWindowClosed");
    await ticket.connect(admin).revokeRole(await ticket.ORGANIZER_ROLE(), organizer.address);
    await expect(ticket.connect(admin).cancelEvent(1)).to.emit(ticket, "EventCancelled");
    await expect(ticket.connect(buyer1).refund(1)).to.be.revertedWithCustomError(ticket, "AlreadyUsed");
    await expect(ticket.connect(buyer2).refund(2)).to.emit(ticket, "Refunded").withArgs(2, buyer2.address, PRICE);
  });

  it("R-04b: event yang dananya sudah diklaim tidak bisa dibatalkan", async () => {
    const { ticket, admin, organizer, date } = await loadFixture(fixture);
    await time.increaseTo(date + DAY);
    await ticket.connect(organizer).claimRevenue(1);
    await ticket.connect(admin).revokeRole(await ticket.ORGANIZER_ROLE(), organizer.address);
    await expect(ticket.connect(admin).cancelEvent(1)).to.be.revertedWithCustomError(ticket, "AlreadyClaimed");
  });

  it("R-04: admin tidak bisa membatalkan event yang sudah berlangsung (pendapatan organizer aman)", async () => {
    const { ticket, admin, organizer, date } = await loadFixture(fixture);
    await time.increaseTo(date + 2 * HOUR);
    await expect(ticket.connect(admin).cancelEvent(1)).to.be.revertedWithCustomError(ticket, "CancelWindowClosed");
    await time.increaseTo(date + DAY);
    await expect(ticket.connect(organizer).claimRevenue(1)).to.emit(ticket, "RevenueClaimed").withArgs(1, organizer.address, PRICE);
  });

  it("R-05: batas per wallet berlaku per alamat (Sybil = risiko yang diterima, lihat README)", async () => {
    const { ticket, buyer1 } = await loadFixture(fixture);
    await ticket.connect(buyer1).buyTicket(1, { value: PRICE });
    await expect(ticket.connect(buyer1).buyTicket(1, { value: PRICE }))
      .to.be.revertedWithCustomError(ticket, "WalletLimitReached");
  });

  it("R-06: QR dengan masa berlaku panjang ditolak (maks. 10 menit)", async () => {
    const { ticket, gate, buyer1, date } = await loadFixture(fixture);
    const farDeadline = date + 365 * DAY;
    const sig = await signCheckIn(ticket, buyer1, 1, farDeadline);
    await time.increaseTo(date - HOUR);
    await expect(ticket.connect(gate).checkIn(1, farDeadline, sig)).to.be.revertedWithCustomError(ticket, "DeadlineTooFar");
  });

  it("R-09: pembeli resale mendapat kembali 110% saat event batal, penjual tidak untung", async () => {
    const { ticket, organizer, buyer1, buyer2 } = await loadFixture(fixture);
    const resalePrice = (PRICE * 11000n) / 10000n;
    await ticket.connect(buyer1).listForResale(1, resalePrice);
    await ticket.connect(buyer2).buyResale(1, { value: resalePrice });
    await ticket.connect(organizer).cancelEvent(1);

    await ticket.connect(buyer1).refund(1);
    await ticket.settleSale(1);
    expect(await ticket.pendingWithdrawals(buyer1.address)).to.equal(PRICE);
    expect(await ticket.pendingWithdrawals(buyer2.address)).to.equal(resalePrice);
  });
});
