'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useEvents } from '@/hooks/useEvents';
import { EventCard, EventCardSkeleton } from '@/components/EventCard';
import { IconSearch, IconShield, IconTag, IconRefresh, IconWallet, IconTicket, IconScan } from '@/components/Icons';
import { OnchainEvent } from '@/lib/types';

const now = () => Math.floor(Date.now() / 1000);
const onSale = (e: OnchainEvent) => !e.cancelled && Number(e.eventDate) > now() && e.sold < e.maxSupply;

export default function Home() {
  const router = useRouter();
  const { events, details, loading, error, reload } = useEvents();
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('');
  const [when, setWhen] = useState('');

  const locations = useMemo(
    () => Array.from(new Set(Object.values(details).map((d) => d?.location?.trim()).filter(Boolean) as string[])).sort(),
    [details]
  );
  const available = events.filter(onSale);
  const soon = [...available].sort((a, b) => Number(a.eventDate - b.eventDate)).slice(0, 10);
  const popular = [...available].sort((a, b) => Number(b.sold - a.sold)).slice(0, 10);
  const almostGone = available.filter((e) => Number(e.maxSupply - e.sold) <= Math.max(5, Number(e.maxSupply) * 0.2)).slice(0, 10);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (loc) p.set('loc', loc);
    if (when) p.set('when', when);
    router.push(`/explore${p.toString() ? `?${p}` : ''}`);
  };

  const Row = ({ title, list, sub }: { title: string; list: OnchainEvent[]; sub?: string }) =>
    list.length === 0 && !loading ? null : (
      <section className="section">
        <div className="section-head">
          <div>
            <h2>{title}</h2>
            {sub && <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>{sub}</div>}
          </div>
          <Link className="link" href="/explore">Lihat semua</Link>
        </div>
        <div className="scroller">
          {loading
            ? Array.from({ length: 4 }, (_, i) => <EventCardSkeleton key={i} />)
            : list.map((ev) => <EventCard key={ev.id} ev={ev} detail={details[ev.id]} />)}
        </div>
      </section>
    );

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Tiket konser & event, aman dari calo dan tiket palsu</h1>
          <p>Setiap tiket TiketKu adalah NFT di blockchain. Harga jual ulang dibatasi, dana kamu aman sampai acara selesai.</p>
          <div className="trust-row">
            <div className="trust"><span className="trust-icon"><IconShield size={16} /></span> 100% tiket asli</div>
            <div className="trust"><span className="trust-icon"><IconTag size={16} /></span> Resale maks. 110%</div>
            <div className="trust"><span className="trust-icon"><IconRefresh size={16} /></span> Refund kalau event batal</div>
          </div>
        </div>
      </section>

      <div className="container">
        <form className="search-box" onSubmit={search} role="search">
          <div className="field">
            <label htmlFor="q">Cari event</label>
            <input id="q" className="input" placeholder="Nama konser, festival, seminar…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
          </div>
          <div className="field">
            <label htmlFor="loc">Lokasi</label>
            <select id="loc" className="select" value={loc} onChange={(e) => setLoc(e.target.value)}>
              <option value="">Semua lokasi</option>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="when">Kapan</label>
            <select id="when" className="select" value={when} onChange={(e) => setWhen(e.target.value)}>
              <option value="">Kapan saja</option>
              <option value="week">7 hari ke depan</option>
              <option value="month">30 hari ke depan</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-accent btn-block" type="submit" style={{ height: 46 }}><IconSearch /> Cari</button>
          </div>
        </form>

        {error && (
          <div className="notice notice-err section" role="alert">
            <span style={{ flex: 1 }}>{error}</span>
            <button className="btn btn-sm btn-outline" onClick={reload}>Coba lagi</button>
          </div>
        )}

        <Row title="Segera berlangsung" sub="Amankan tiketmu sebelum acara dimulai" list={soon} />
        <Row title="Paling laris" sub="Event yang paling banyak dibeli" list={popular} />
        <Row title="Hampir habis 🔥" sub="Stok tinggal sedikit" list={almostGone} />

        {!loading && !error && events.length === 0 && (
          <div className="panel empty section">
            <div className="empty-icon"><IconTicket size={28} /></div>
            <h2 style={{ fontSize: 20 }}>Belum ada event</h2>
            <p className="muted">Event Organizer bisa membuat event pertama dari Dashboard EO.</p>
          </div>
        )}

        <section className="section">
          <div className="section-head"><h2>Cara kerja TiketKu</h2></div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {[
              { i: <IconWallet size={22} />, t: '1. Masuk dengan wallet', d: 'Login pakai MetaMask, tanpa password. Cukup tanda tangan pesan.' },
              { i: <IconTicket size={22} />, t: '2. Beli tiket NFT', d: 'Bayar dengan ETH. Tiket langsung masuk ke wallet kamu dan tercatat di blockchain.' },
              { i: <IconTag size={22} />, t: '3. Jual ulang dengan adil', d: 'Tidak bisa datang? Jual ulang di TiketKu, maksimal 110% dari harga asli.' },
              { i: <IconScan size={22} />, t: '4. Tunjukkan QR di gate', d: 'QR dibuat dari tanda tangan wallet kamu dan berlaku 5 menit. Screenshot lama tidak bisa dipakai.' },
            ].map((s) => (
              <div key={s.t} className="panel">
                <div className="info-icon" style={{ marginBottom: 10 }}>{s.i}</div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.t}</div>
                <div className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
