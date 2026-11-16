import { formatEther } from 'ethers';

export const short = (addr?: string) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';

export const eth = (wei: bigint | number | string) => {
  try {
    return `${Number(formatEther(BigInt(wei))).toLocaleString('id-ID', {
      maximumFractionDigits: 6,
    })} ETH`;
  } catch {
    return '0 ETH';
  }
};

export const fmtDate = (unixSeconds: number | bigint) => {
  const d = new Date(Number(unixSeconds) * 1000);
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const fmtDateShort = (unixSeconds: number | bigint) =>
  new Date(Number(unixSeconds) * 1000).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

// Status event untuk badge
export function eventStatus(ev: {
  cancelled: boolean;
  sold: bigint;
  maxSupply: bigint;
  eventDate: bigint;
}): { label: string; cls: string } {
  const now = Math.floor(Date.now() / 1000);
  if (ev.cancelled) return { label: 'Dibatalkan', cls: 'badge-red' };
  if (Number(ev.eventDate) <= now) return { label: 'Selesai', cls: 'badge-gray' };
  if (ev.sold >= ev.maxSupply) return { label: 'Habis', cls: 'badge-amber' };
  return { label: 'Tersedia', cls: 'badge-green' };
}
