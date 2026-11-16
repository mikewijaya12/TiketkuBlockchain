'use client';

import { useCallback, useEffect, useState } from 'react';
import { getContract, readProvider } from '@/lib/contract';
import { useWallet } from '@/lib/wallet';
import { useTx } from '@/hooks/useTx';
import { eth, fmtDate } from '@/lib/format';
import { IconRefresh, IconTag } from './Icons';

const CLAIM_DELAY = 86400;

type Item = {
  key: string;
  kind: 'refund' | 'sale';
  id: number;            // tokenId (refund) atau saleId (sale)
  tokenId: number;
  eventName: string;
  amount: bigint;
  role: 'primary' | 'seller' | 'buyer';
  readyAt: number | null; // null = siap sekarang
};

// Dana yang menunggu dicairkan: refund harga asli (event batal) dan hasil/pengembalian resale.
export function Claims({ refreshKey = 0, onChange }: { refreshKey?: number; onChange?: () => void }) {
  const { address } = useWallet();
  const { run, pending } = useTx();
  const [items, setItems] = useState<Item[] | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    const c = getContract(readProvider());
    const me = address.toLowerCase();
    const evCache = new Map<number, { name: string; date: number; cancelled: boolean; price: bigint }>();
    const ev = async (id: number) => {
      if (!evCache.has(id)) {
        const [e, cancelled] = await Promise.all([c.events(id), c.cancelled(id)]);
        evCache.set(id, { name: e.name ?? e[0], date: Number(e.eventDate ?? e[6]), cancelled, price: e.price ?? e[2] });
      }
      return evCache.get(id)!;
    };
    const out: Item[] = [];
    const now = Date.now() / 1000;

    // Refund harga asli untuk pembeli pertama pada event yang dibatalkan.
    const count = Number(await c.ticketCount());
    await Promise.all(Array.from({ length: count }, (_, i) => i + 1).map(async (tokenId) => {
      const pb: string = await c.primaryBuyer(tokenId);
      if (pb.toLowerCase() !== me) return;
      const t = await c.tickets(tokenId);
      const e = await ev(Number(t.eventId ?? t[0]));
      if (!e.cancelled || (await c.refunded(tokenId))) return;
      out.push({ key: `r${tokenId}`, kind: 'refund', id: tokenId, tokenId, eventName: e.name, amount: e.price, role: 'primary', readyAt: null });
    }));

    // Dana resale yang ditahan (sebagai penjual atau pembeli).
    const logs = await c.queryFilter(c.filters.ResaleRecorded()).catch(() => []);
    await Promise.all(logs.map(async (l: any) => {
      const saleId = Number(l.args.saleId);
      const seller = String(l.args.seller).toLowerCase();
      const buyer = String(l.args.buyer).toLowerCase();
      if (seller !== me && buyer !== me) return;
      const s = await c.sales(saleId);
      if (s.settled ?? s[4]) return;
      const tokenId = Number(l.args.tokenId);
      const t = await c.tickets(tokenId);
      const e = await ev(Number(t.eventId ?? t[0]));
      const amount: bigint = l.args.amount;
      if (e.cancelled && buyer === me) {
        out.push({ key: `s${saleId}`, kind: 'sale', id: saleId, tokenId, eventName: e.name, amount, role: 'buyer', readyAt: null });
      } else if (!e.cancelled && seller === me) {
        const at = e.date + CLAIM_DELAY;
        out.push({ key: `s${saleId}`, kind: 'sale', id: saleId, tokenId, eventName: e.name, amount, role: 'seller', readyAt: now >= at ? null : at });
      }
    }));
    out.sort((a, b) => (a.readyAt ?? 0) - (b.readyAt ?? 0));
    setItems(out);
  }, [address]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (!items || items.length === 0) return null;
  const label = (i: Item) =>
    i.role === 'primary' ? 'Refund harga tiket (event dibatalkan)'
    : i.role === 'buyer' ? 'Pengembalian pembelian resale (event dibatalkan)'
    : 'Hasil jual ulang';

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>Dana & refund</div>
      <div className="tx-list">
        {items.map((i) => (
          <div key={i.key} className="tx-item" style={{ flexWrap: 'wrap' }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="info-icon">{i.kind === 'refund' ? <IconRefresh /> : <IconTag />}</span>
              <div>
                <div style={{ fontWeight: 700 }}>{label(i)}</div>
                <div className="hint">{i.eventName} · Tiket #{i.tokenId}</div>
              </div>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <span className="price">{eth(i.amount)}</span>
              {i.readyAt ? (
                <span className="badge badge-gray">Cair {fmtDate(i.readyAt)}</span>
              ) : (
                <button className="btn btn-sm btn-accent" disabled={pending === i.key} onClick={async () => {
                  const ok = await run(i.key, (c) => (i.kind === 'refund' ? c.refund(i.id) : c.settleSale(i.id)), {
                    success: `${eth(i.amount)} masuk ke saldo. Tarik ke wallet di atas.`,
                  });
                  if (ok) { load(); onChange?.(); }
                }}>{pending === i.key ? 'Memproses…' : 'Cairkan'}</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
