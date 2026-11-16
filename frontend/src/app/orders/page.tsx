'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { parseEther } from 'ethers';
import { getContract, parseContractError, readProvider } from '@/lib/contract';
import { fetchEvent, fetchMyTickets } from '@/lib/events';
import { api } from '@/lib/api';
import { useWallet } from '@/lib/wallet';
import { useToast } from '@/lib/toast';
import { useTx } from '@/hooks/useTx';
import { signCheckIn, QR_TTL_SECONDS } from '@/lib/checkin';
import { EventDetail, MyTicket, OnchainEvent } from '@/lib/types';
import { eth, fmtDate } from '@/lib/format';
import { Guard } from '@/components/Guard';
import { Poster } from '@/components/Poster';
import { Modal } from '@/components/Modal';
import { Balance } from '@/components/Balance';
import { Claims } from '@/components/Claims';
import { IconCalendar, IconCheck, IconPin, IconTicket, IconInfo } from '@/components/Icons';

type Tab = 'active' | 'listed' | 'done' | 'cancelled';
type Row = MyTicket & { event: OnchainEvent; detail: EventDetail | null };

function classify(t: Row): Tab {
  if (t.event.cancelled) return 'cancelled';
  if (t.listingPrice > 0n) return 'listed';
  const closesAt = Number(t.event.eventDate) + 86400;
  if (t.used || closesAt < Date.now() / 1000) return 'done';
  return 'active';
}

function QrModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const { signer } = useWallet();
  const toast = useToast();
  const [img, setImg] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [left, setLeft] = useState(0);
  const [used, setUsed] = useState(row.used);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>();

  const generate = useCallback(async () => {
    if (!signer) return;
    setBusy(true);
    try {
      const { payload, text } = await signCheckIn(signer, row.tokenId);
      setImg(await QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: 480 }));
      setDeadline(payload.d);
    } catch (e) {
      toast(parseContractError(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [signer, row.tokenId, toast]);

  useEffect(() => {
    timer.current = setInterval(() => setLeft(Math.max(0, deadline - Math.floor(Date.now() / 1000))), 1000);
    return () => clearInterval(timer.current);
  }, [deadline]);

  // Pantau status check-in agar layar pembeli langsung berubah setelah dipindai.
  useEffect(() => {
    if (used) return;
    const c = getContract(readProvider());
    const iv = setInterval(async () => {
      const t = await c.tickets(row.tokenId).catch(() => null);
      if (t && (t.used ?? t[1])) setUsed(true);
    }, 4000);
    return () => clearInterval(iv);
  }, [row.tokenId, used]);

  const opensAt = Number(row.event.eventDate) - 6 * 3600;
  const notYet = Date.now() / 1000 < opensAt;

  return (
    <Modal title="E-tiket" onClose={onClose} width={420}>
      <div className="eticket stack" style={{ alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{row.event.name}</div>
          <div className="muted" style={{ fontSize: 13 }}>{fmtDate(row.event.eventDate)} · Tiket #{row.tokenId}</div>
        </div>
        {used ? (
          <div className="stack" style={{ alignItems: 'center' }}>
            <div className="success-mark"><IconCheck size={36} /></div>
            <b>Check-in berhasil. Selamat menikmati acara!</b>
          </div>
        ) : img && left > 0 ? (
          <>
            <div className="eticket-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt={`QR tiket ${row.tokenId}`} />
            </div>
            <div>QR berlaku <span className="countdown">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span></div>
            <div className="hint">Tunjukkan ke petugas gate. Jangan bagikan QR ini.</div>
          </>
        ) : (
          <>
            {notYet && <div className="notice notice-info" style={{ textAlign: 'left' }}><IconInfo /> <span>Gate dibuka mulai {fmtDate(opensAt)}. Buat QR saat sudah di lokasi.</span></div>}
            {img && left === 0 && <div className="notice notice-warn">QR sudah kedaluwarsa. Buat yang baru.</div>}
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>QR dibuat dari tanda tangan wallet kamu (tanpa biaya gas) dan hanya berlaku {QR_TTL_SECONDS / 60} menit.</p>
            <button className="btn btn-primary btn-block" disabled={busy} onClick={generate}>{busy ? 'Menunggu tanda tangan…' : 'Tampilkan QR'}</button>
          </>
        )}
      </div>
    </Modal>
  );
}

function ResaleModal({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const { run, pending } = useTx();
  const cap = (row.event.price * BigInt(row.event.maxResaleBps)) / 10000n;
  const capEth = Number(cap) / 1e18;
  const [price, setPrice] = useState(String(Number(row.event.price) / 1e18));
  let wei = 0n;
  let err = '';
  try {
    wei = parseEther(price || '0');
    if (wei <= 0n) err = 'Harga harus lebih dari 0';
    else if (wei > cap) err = `Maksimal ${eth(cap)}`;
  } catch {
    err = 'Format harga tidak valid';
  }
  return (
    <Modal title="Jual ulang tiket" onClose={onClose}>
      <div className="stack">
        <div className="summary-row"><span>Event</span><b>{row.event.name}</b></div>
        <div className="summary-row"><span>Harga beli asli</span><span>{eth(row.event.price)}</span></div>
        <div className="summary-row"><span>Batas harga resale</span><b>{eth(cap)}</b></div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="rp">Harga jual (ETH)</label>
          <input id="rp" className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} />
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="chip" onClick={() => setPrice(String(Number(row.event.price) / 1e18))}>Harga asli</button>
            <button type="button" className="chip" onClick={() => setPrice(String(capEth))}>Maksimal</button>
          </div>
          {err && <div className="err-text">{err}</div>}
        </div>
        <div className="notice notice-info"><IconInfo /> <span>Hasil penjualan ditahan smart contract dan bisa dicairkan 1 hari setelah acara selesai. Jika event dibatalkan, pembeli mendapat uangnya kembali. Listing otomatis ditutup saat acara mulai.</span></div>
        <button className="btn btn-accent btn-block" disabled={!!err || pending === 'list'} onClick={async () => {
          if (await run('list', (c) => c.listForResale(row.tokenId, wei), { success: 'Tiket berhasil dipasang di resale.' })) { onDone(); onClose(); }
        }}>{pending === 'list' ? 'Memproses…' : 'Pasang di resale'}</button>
      </div>
    </Modal>
  );
}

function Orders() {
  const { address } = useWallet();
  const { run, pending } = useTx();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<Tab>('active');
  const [qr, setQr] = useState<Row | null>(null);
  const [resale, setResale] = useState<Row | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!address) return;
    const p = readProvider();
    const mine = await fetchMyTickets(p, address).catch(() => []);
    const ids = Array.from(new Set(mine.map((t) => t.eventId)));
    const evs = await Promise.all(ids.map(async (id) => [id, await fetchEvent(p, id).catch(() => null), await api.getEventDetail(id).catch(() => null)] as const));
    const map = new Map(evs.map(([id, e, d]) => [id, { e, d }]));
    setRows(mine.flatMap((t) => {
      const m = map.get(t.eventId);
      return m?.e ? [{ ...t, event: m.e, detail: m.d }] : [];
    }));
    setTick((x) => x + 1);
  }, [address]);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const g: Record<Tab, Row[]> = { active: [], listed: [], done: [], cancelled: [] };
    (rows ?? []).forEach((r) => g[classify(r)].push(r));
    g.active.sort((a, b) => Number(a.event.eventDate - b.event.eventDate));
    return g;
  }, [rows]);

  const TABS: [Tab, string][] = [['active', 'Aktif'], ['listed', 'Dijual'], ['done', 'Selesai'], ['cancelled', 'Dibatalkan']];

  return (
    <div className="container page">
      <h1 className="page-title">Tiket Saya</h1>
      <p className="muted" style={{ margin: '0 0 16px' }}>E-tiket NFT yang ada di wallet kamu.</p>
      <Balance refreshKey={tick} hint="Dari refund atau hasil resale yang sudah dicairkan." />
      <Claims refreshKey={tick} onChange={() => setTick((x) => x + 1)} />
      <div className="tabs" role="tablist" style={{ marginTop: 16 }}>
        {TABS.map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)} role="tab" aria-selected={tab === k}>
            {l} {rows && groups[k].length > 0 && <span className="badge badge-blue" style={{ marginLeft: 4 }}>{groups[k].length}</span>}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="stack">{[0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 130 }} />)}</div>
      ) : groups[tab].length === 0 ? (
        <div className="panel empty">
          <div className="empty-icon"><IconTicket size={28} /></div>
          <h2 style={{ fontSize: 18 }}>{tab === 'active' ? 'Belum ada tiket aktif' : 'Tidak ada tiket di sini'}</h2>
          {tab === 'active' && <><p className="muted">Yuk cari event seru dan amankan tiketmu.</p><Link href="/explore" className="btn btn-primary">Jelajah event</Link></>}
        </div>
      ) : (
        <div className="stack">
          {groups[tab].map((r) => (
            <div key={r.tokenId} className="card ticket">
              <Poster id={r.event.id} name={r.event.name} url={r.detail?.posterUrl} />
              <div className="ticket-body">
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className="badge badge-gray">Tiket #{r.tokenId}</span>
                  {tab === 'active' && <span className="badge badge-green">Siap dipakai</span>}
                  {tab === 'listed' && <span className="badge badge-amber">Dijual {eth(r.listingPrice)}</span>}
                  {tab === 'done' && <span className={`badge ${r.used ? 'badge-green' : 'badge-gray'}`}>{r.used ? 'Sudah check-in' : 'Acara selesai'}</span>}
                  {tab === 'cancelled' && <span className="badge badge-red">Event dibatalkan</span>}
                </div>
                <Link href={`/events/${r.event.id}`} style={{ fontWeight: 800, fontSize: 16 }}>{r.event.name}</Link>
                <div className="meta"><IconCalendar size={14} /> {fmtDate(r.event.eventDate)}</div>
                <div className="meta"><IconPin size={14} /> {r.detail?.location || '-'}</div>
              </div>
              <div className="ticket-actions">
                {tab === 'active' && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => setQr(r)}>Tampilkan e-tiket</button>
                    <button className="btn btn-outline btn-sm" onClick={() => setResale(r)}>Jual ulang</button>
                  </>
                )}
                {tab === 'listed' && (
                  <button className="btn btn-outline btn-sm" disabled={pending === `cancel-${r.tokenId}`} onClick={async () => {
                    if (await run(`cancel-${r.tokenId}`, (c) => c.cancelListing(r.tokenId), { success: 'Listing dibatalkan.' })) load();
                  }}>Batalkan jual</button>
                )}
                {tab === 'cancelled' && <span className="hint">Cairkan refund di bagian &quot;Dana &amp; refund&quot; di atas.</span>}
                {tab === 'done' && <span className="hint">Terima kasih sudah datang!</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {qr && <QrModal row={qr} onClose={() => { setQr(null); load(); }} />}
      {resale && <ResaleModal row={resale} onClose={() => setResale(null)} onDone={load} />}
    </div>
  );
}

export default function OrdersPage() {
  return <Guard><Orders /></Guard>;
}
