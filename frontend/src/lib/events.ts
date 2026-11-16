import { getContract, Runner } from './contract';
import { OnchainEvent, MyTicket } from './types';

function mapEvent(id: number, raw: any, cancelled: boolean, perWallet: bigint): OnchainEvent {
  return {
    id,
    name: raw.name ?? raw[0],
    organizer: raw.organizer ?? raw[1],
    price: raw.price ?? raw[2],
    maxSupply: raw.maxSupply ?? raw[3],
    sold: raw.sold ?? raw[4],
    maxResaleBps: Number(raw.maxResaleBps ?? raw[5]),
    eventDate: raw.eventDate ?? raw[6],
    cancelled,
    maxPerWallet: perWallet,
  };
}

// Ambil satu event lengkap (info + cancelled + maxPerWallet).
export async function fetchEvent(
  runner: Runner,
  id: number
): Promise<OnchainEvent | null> {
  const c = getContract(runner);
  const [raw, cancelled, perWallet] = await Promise.all([
    c.events(id),
    c.cancelled(id),
    c.maxPerWallet(id),
  ]);
  const organizer = raw.organizer ?? raw[1];
  if (!organizer || organizer === '0x0000000000000000000000000000000000000000') {
    return null; // event terhapus / belum ada
  }
  return mapEvent(id, raw, cancelled, perWallet);
}

// Semua event 1..eventCount (event yang terhapus di-skip).
export async function fetchAllEvents(
  runner: Runner
): Promise<OnchainEvent[]> {
  const c = getContract(runner);
  const count = Number(await c.eventCount());
  const ids = Array.from({ length: count }, (_, i) => i + 1);
  const list = await Promise.all(ids.map((id) => fetchEvent(runner, id).catch(() => null)));
  return list.filter((e): e is OnchainEvent => e !== null);
}

// Tiket milik satu alamat: scan 1..ticketCount, cek ownerOf.
// Untuk skala tugas (ratusan token) ini cukup; produksi nyata pakai indexer/subgraph.
export async function fetchMyTickets(
  runner: Runner,
  owner: string
): Promise<MyTicket[]> {
  const c = getContract(runner);
  const count = Number(await c.ticketCount());
  const out: MyTicket[] = [];
  const lc = owner.toLowerCase();

  const checks = Array.from({ length: count }, (_, i) => i + 1).map(async (tokenId) => {
    let holder: string;
    try {
      holder = await c.ownerOf(tokenId);
    } catch {
      return; // token sudah di-burn (refund)
    }
    if (holder.toLowerCase() !== lc) return;
    const [t, listing] = await Promise.all([c.tickets(tokenId), c.listingPrice(tokenId)]);
    out.push({
      tokenId,
      eventId: Number(t.eventId ?? t[0]),
      used: Boolean(t.used ?? t[1]),
      listingPrice: listing,
    });
  });
  await Promise.all(checks);
  out.sort((a, b) => a.tokenId - b.tokenId);
  return out;
}

// Tiket yang sedang dijual (resale) untuk sebuah event.
export async function fetchListings(
  runner: Runner,
  eventId: number
): Promise<Array<{ tokenId: number; price: bigint; seller: string }>> {
  const c = getContract(runner);
  const count = Number(await c.ticketCount());
  const out: Array<{ tokenId: number; price: bigint; seller: string }> = [];

  const checks = Array.from({ length: count }, (_, i) => i + 1).map(async (tokenId) => {
    const t = await c.tickets(tokenId);
    if (Number(t.eventId ?? t[0]) !== eventId) return;
    const price = await c.listingPrice(tokenId);
    if (price === 0n) return;
    let seller = '';
    try {
      seller = await c.ownerOf(tokenId);
    } catch {
      return;
    }
    out.push({ tokenId, price, seller });
  });
  await Promise.all(checks);
  out.sort((a, b) => Number(a.price - b.price));
  return out;
}
