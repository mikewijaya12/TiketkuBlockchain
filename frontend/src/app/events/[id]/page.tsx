'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { readProvider, getContract } from '@/lib/contract';
import { fetchEvent, fetchListings } from '@/lib/events';
import { api } from '@/lib/api';
import { useWallet } from '@/lib/wallet';
import { useTx } from '@/hooks/useTx';
import { EventDetail, OnchainEvent } from '@/lib/types';
import { eth, eventStatus, fmtDate, short } from '@/lib/format';
import { EXPLORER_URL } from '@/lib/config';
import { Poster } from '@/components/Poster';
import { Modal } from '@/components/Modal';
import { LoginButton } from '@/components/LoginButton';
import { IconCalendar, IconPin, IconShield, IconTag, IconUser, IconTicket, IconInfo } from '@/components/Icons';

type Listing = { tokenId: number; price: bigint; seller: string };

export default function EventPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const { address, authed } = useWallet();
  const { run, pending } = useTx();

  const [ev, setEv] = useState<OnchainEvent | null | undefined>(undefined);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [held, setHeld] = useState(0);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<'desc' | 'rules' | 'resale'>('desc');
  const [buying, setBuying] = useState<Listing | null>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(id) || id <= 0) return setEv(null);
    const p = readProvider();
    const [e, d, l] = await Promise.all([
      fetchEvent(p, id).catch(() => null),
      api.getEventDetail(id).catch(() => null),
      fetchListings(p, id).catch(() => []),
    ]);
    setEv(e);
    setDetail(d);
    setListings(l);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!address || !ev) return setHeld(0);
    getContract(readProvider()).heldCount(id, address).then((n: bigint) => setHeld(Number(n))).catch(() => {});
  }, [address, ev, id]);

  if (ev === undefined) {
    return (
      <div className="container page">
        <div className="detail-grid">
          <div className="stack"><div className="skeleton detail-hero" /><div className="skeleton" style={{ height: 28, width: '60%' }} /><div className="skeleton" style={{ height: 120 }} /></div>
          <div className="skeleton" style={{ height: 320 }} />
        </div>
      </div>
    );
  }
  if (ev === null) {
    return (
      <div className="container page">
        <div className="panel empty">
          <div className="empty-icon"><IconTicket size={28} /></div>
          <h2 style={{ fontSize: 20 }}>Event tidak ditemukan</h2>
          <p className="muted">Event mungkin sudah dihapus oleh penyelenggara.</p>
          <Link href="/explore" className="btn btn-primary">Cari event lain</Link>
        </div>
      </div>
    );
  }

  const st = eventStatus(ev);
  const remaining = Number(ev.maxSupply - ev.sold);
  const perWallet = Number(ev.maxPerWallet);
  const allowance = Math.max(0, perWallet - held);
  const maxQty = Math.min(remaining, allowance);
  const canBuy = st.label === 'Tersedia' && maxQty > 0;
  const pct = Math.min(100, Math.round((Number(ev.sold) / Number(ev.maxSupply)) * 100));
  const resaleCap = (ev.price * BigInt(ev.maxResaleBps)) / 10000n;
  const q = Math.min(Math.max(1, qty), Math.max(1, maxQty));
  const onSaleWindow = !ev.cancelled && Number(ev.eventDate) > Date.now() / 1000;

  const reason = ev.cancelled ? 'Event ini dibatalkan. Pemegang tiket bisa refund dari halaman Tiket Saya.'
    : st.label === 'Selesai' ? 'Penjualan sudah ditutup karena acara sudah dimulai.'
    : remaining === 0 ? 'Tiket habis. Cek tiket resale di tab "Tiket Resale".'
    : allowance === 0 ? `Kamu sudah memegang ${held} tiket (batas ${perWallet} per wallet).`
    : '';

  const checkout = () => router.push(`/checkout/${ev.id}?qty=${q}`);

  const Booking = (
    <div className="panel stack sticky">
      <div>
        <div className="from">Harga per tiket</div>
        <div className="price" style={{ fontSize: 26 }}>{eth(ev.price)}</div>
      </div>
      <div>
        <div className="row between" style={{ fontSize: 13, marginBottom: 6 }}>
          <span className="muted">{ev.sold.toString()} / {ev.maxSupply.toString()} terjual</span>
          <span style={{ fontWeight: 700, color: remaining <= 10 ? 'var(--red-500)' : undefined }}>Sisa {remaining}</span>
        </div>
        <div className="stock"><div style={{ width: `${pct}%` }} /></div>
      </div>
      {canBuy ? (
        <>
          <div className="row between">
            <div>
              <div style={{ fontWeight: 600 }}>Jumlah tiket</div>
              <div className="hint">Maks. {perWallet} per wallet{held ? ` · kamu punya ${held}` : ''}</div>
            </div>
            <div className="qty">
              <button onClick={() => setQty(q - 1)} disabled={q <= 1} aria-label="Kurangi">−</button>
              <span aria-live="polite">{q}</span>
              <button onClick={() => setQty(q + 1)} disabled={q >= maxQty} aria-label="Tambah">+</button>
            </div>
          </div>
          <div className="summary-row summary-total" style={{ margin: 0 }}>
            <span>Subtotal</span><span className="price">{eth(ev.price * BigInt(q))}</span>
          </div>
          {authed ? (
            <button className="btn btn-accent btn-block" onClick={checkout} style={{ height: 48, fontSize: 16 }}>Pesan Sekarang</button>
          ) : (
            <LoginButton className="btn btn-primary btn-block" label="Masuk untuk memesan" />
          )}
          <div className="hint" style={{ textAlign: 'center' }}>Belum termasuk biaya gas jaringan</div>
        </>
      ) : (
        <div className="notice notice-warn"><IconInfo /> <span>{reason}</span></div>
      )}
      <div className="stack" style={{ gap: 8, fontSize: 13 }}>
        <div className="row"><IconShield size={16} /> Tiket asli tercatat di blockchain</div>
        <div className="row"><IconTag size={16} /> Resale resmi maks. {eth(resaleCap)}</div>
      </div>
    </div>
  );

  return (
    <div className="container page">
      <nav className="muted" style={{ fontSize: 13, marginBottom: 12 }} aria-label="Breadcrumb">
        <Link href="/" className="link">Beranda</Link> / <Link href="/explore" className="link">Event</Link> / <span>{ev.name}</span>
      </nav>
      <div className="detail-grid">
        <div className="stack" style={{ gap: 18 }}>
          <Poster id={ev.id} name={ev.name} url={detail?.posterUrl} className="poster detail-hero" />
          <div>
            <div className="row wrap" style={{ marginBottom: 8 }}>
              <span className={`badge ${st.cls}`}>{st.label}</span>
              <span className="badge badge-blue">Tiket NFT</span>
              <span className="badge badge-gray">#{ev.id}</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800 }}>{ev.name}</h1>
          </div>
          <div className="panel info-list">
            <div className="info-item"><span className="info-icon"><IconCalendar /></span><div><div style={{ fontWeight: 700 }}>{fmtDate(ev.eventDate)}</div><div className="muted" style={{ fontSize: 13 }}>Gate dibuka 6 jam sebelum acara</div></div></div>
            <div className="info-item"><span className="info-icon"><IconPin /></span><div><div style={{ fontWeight: 700 }}>{detail?.location || 'Lokasi segera diumumkan'}</div></div></div>
            <div className="info-item"><span className="info-icon"><IconUser /></span><div><div style={{ fontWeight: 700 }}>Penyelenggara</div><div className="mono muted" style={{ fontSize: 13 }}>
              {EXPLORER_URL ? <a className="link" href={`${EXPLORER_URL}/address/${ev.organizer}`} target="_blank" rel="noopener noreferrer">{short(ev.organizer)}</a> : short(ev.organizer)}
            </div></div></div>
          </div>

          <div className="panel">
            <div className="tabs" role="tablist">
              <button className={`tab ${tab === 'desc' ? 'active' : ''}`} onClick={() => setTab('desc')} role="tab" aria-selected={tab === 'desc'}>Deskripsi</button>
              <button className={`tab ${tab === 'rules' ? 'active' : ''}`} onClick={() => setTab('rules')} role="tab" aria-selected={tab === 'rules'}>Info Tiket & Aturan</button>
              <button className={`tab ${tab === 'resale' ? 'active' : ''}`} onClick={() => setTab('resale')} role="tab" aria-selected={tab === 'resale'}>Tiket Resale ({listings.length})</button>
            </div>
            {tab === 'desc' && (
              <div className="prose">{detail?.description || <span className="muted">Penyelenggara belum menambahkan deskripsi.</span>}</div>
            )}
            {tab === 'rules' && (
              <ul className="rules" style={{ paddingLeft: 18, margin: 0 }}>
                <li>Tiket berbentuk NFT dan otomatis masuk ke wallet pembeli.</li>
                <li>Maksimal <b>{perWallet} tiket per wallet</b>, termasuk tiket dari resale.</li>
                <li>Tiket <b>tidak bisa ditransfer bebas</b>. Jual ulang hanya lewat TiketKu, maksimal <b>{(ev.maxResaleBps / 100).toFixed(0)}%</b> dari harga asli ({eth(resaleCap)}).</li>
                <li>Penjualan dan resale ditutup saat acara dimulai.</li>
                <li>Dana pembelian dan resale ditahan smart contract dan baru cair 1 hari setelah acara.</li>
                <li>Jika event dibatalkan, setiap pembayaran dikembalikan penuh ke yang membayar (termasuk pembelian resale).</li>
                <li>Saat masuk, tunjukkan QR dari halaman Tiket Saya. QR berlaku 5 menit dan hanya sekali pakai.</li>
              </ul>
            )}
            {tab === 'resale' && (
              listings.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>Belum ada tiket yang dijual ulang.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Tiket</th><th>Penjual</th><th>Harga</th><th /></tr></thead>
                    <tbody>
                      {listings.map((l) => {
                        const mine = address && l.seller.toLowerCase() === address;
                        return (
                          <tr key={l.tokenId}>
                            <td>#{l.tokenId}</td>
                            <td className="mono">{short(l.seller)}</td>
                            <td className="price">{eth(l.price)}</td>
                            <td style={{ textAlign: 'right' }}>
                              {mine ? <span className="badge badge-gray">Milikmu</span>
                                : !authed ? <LoginButton className="btn btn-sm btn-outline" label="Masuk" />
                                : <button className="btn btn-sm btn-primary" disabled={!onSaleWindow || allowance === 0} onClick={() => setBuying(l)}>Beli</button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </div>
        <aside>{Booking}</aside>
      </div>

      {canBuy && (
        <div className="mobile-cta">
          <div><div className="from">Mulai dari</div><div className="price">{eth(ev.price)}</div></div>
          {authed ? <button className="btn btn-accent" onClick={checkout}>Pesan Sekarang</button> : <LoginButton className="btn btn-primary" label="Masuk" />}
        </div>
      )}

      {buying && (
        <Modal title="Beli tiket resale" onClose={() => setBuying(null)}>
          <div className="stack">
            <div className="summary-row"><span>Event</span><b>{ev.name}</b></div>
            <div className="summary-row"><span>Tiket</span><b>#{buying.tokenId}</b></div>
            <div className="summary-row"><span>Penjual</span><span className="mono">{short(buying.seller)}</span></div>
            <div className="summary-row summary-total"><span>Total</span><span className="price">{eth(buying.price)}</span></div>
            <div className="notice notice-info"><IconShield /> <span>Harga resale sudah dibatasi smart contract (maks. {eth(resaleCap)}). Pembayaran langsung tercatat on-chain.</span></div>
            <button
              className="btn btn-accent btn-block"
              disabled={pending === 'resale'}
              onClick={async () => {
                // Baca ulang harga listing tepat sebelum bayar (bisa berubah / sudah terjual).
                const fresh: bigint = await getContract(readProvider()).listingPrice(buying.tokenId);
                if (fresh === 0n) { setBuying(null); await load(); return; }
                const ok = await run('resale', (c) => c.buyResale(buying.tokenId, { value: fresh }), { success: 'Tiket resale berhasil dibeli!' });
                if (ok) { setBuying(null); router.push('/orders'); }
              }}
            >
              {pending === 'resale' ? 'Memproses…' : 'Bayar dengan Wallet'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
