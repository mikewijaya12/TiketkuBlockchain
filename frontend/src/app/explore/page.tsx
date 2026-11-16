'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEvents } from '@/hooks/useEvents';
import { EventCard, EventCardSkeleton } from '@/components/EventCard';
import { IconSearch, IconTicket } from '@/components/Icons';
import { OnchainEvent } from '@/lib/types';

type Sort = 'soon' | 'cheap' | 'expensive' | 'popular';
type Status = 'available' | 'all' | 'past';

function Explore() {
  const sp = useSearchParams();
  const { events, details, loading, error, reload } = useEvents();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [loc, setLoc] = useState(sp.get('loc') ?? '');
  const [when, setWhen] = useState(sp.get('when') ?? '');
  const [status, setStatus] = useState<Status>('available');
  const [sort, setSort] = useState<Sort>('soon');

  const locations = useMemo(
    () => Array.from(new Set(Object.values(details).map((d) => d?.location?.trim()).filter(Boolean) as string[])).sort(),
    [details]
  );

  const list = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const horizon = when === 'week' ? now + 7 * 86400 : when === 'month' ? now + 30 * 86400 : Infinity;
    const term = q.trim().toLowerCase();
    const ok = (e: OnchainEvent) => {
      const d = details[e.id];
      const t = Number(e.eventDate);
      if (status === 'available' && (e.cancelled || t <= now || e.sold >= e.maxSupply)) return false;
      if (status === 'past' && t > now && !e.cancelled) return false;
      if (t > horizon) return false;
      if (loc && d?.location?.trim() !== loc) return false;
      if (term && !`${e.name} ${d?.location ?? ''} ${d?.description ?? ''}`.toLowerCase().includes(term)) return false;
      return true;
    };
    const cmp: Record<Sort, (a: OnchainEvent, b: OnchainEvent) => number> = {
      soon: (a, b) => Number(a.eventDate - b.eventDate),
      cheap: (a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0),
      expensive: (a, b) => (a.price > b.price ? -1 : a.price < b.price ? 1 : 0),
      popular: (a, b) => Number(b.sold - a.sold),
    };
    return events.filter(ok).sort(cmp[sort]);
  }, [events, details, q, loc, when, status, sort]);

  const reset = () => { setQ(''); setLoc(''); setWhen(''); setStatus('available'); };

  return (
    <div className="container page">
      <h1 className="page-title">Jelajah event</h1>
      <p className="muted" style={{ margin: '0 0 18px' }}>Temukan konser, festival, dan acara lain. Semua tiket terverifikasi di blockchain.</p>

      <div className="dash">
        <aside className="panel" style={{ padding: 16 }} aria-label="Filter">
          <div className="row between" style={{ marginBottom: 12 }}>
            <b>Filter</b>
            <button className="link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={reset}>Reset</button>
          </div>
          <div className="field">
            <label htmlFor="fq">Kata kunci</label>
            <input id="fq" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" maxLength={100} />
          </div>
          <div className="field">
            <label htmlFor="fs">Status</label>
            <select id="fs" className="select" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="available">Tiket tersedia</option>
              <option value="all">Semua event</option>
              <option value="past">Selesai / dibatalkan</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="fl">Lokasi</label>
            <select id="fl" className="select" value={loc} onChange={(e) => setLoc(e.target.value)}>
              <option value="">Semua lokasi</option>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="fw">Waktu</label>
            <select id="fw" className="select" value={when} onChange={(e) => setWhen(e.target.value)}>
              <option value="">Kapan saja</option>
              <option value="week">7 hari ke depan</option>
              <option value="month">30 hari ke depan</option>
            </select>
          </div>
        </aside>

        <div>
          <div className="row between wrap" style={{ marginBottom: 14 }}>
            <div className="muted" style={{ fontSize: 14 }}>{loading ? 'Memuat…' : `${list.length} event ditemukan`}</div>
            <div className="chips" role="tablist" aria-label="Urutkan">
              {([['soon', 'Terdekat'], ['popular', 'Terlaris'], ['cheap', 'Termurah'], ['expensive', 'Termahal']] as const).map(([k, l]) => (
                <button key={k} className={`chip ${sort === k ? 'active' : ''}`} onClick={() => setSort(k)} role="tab" aria-selected={sort === k}>{l}</button>
              ))}
            </div>
          </div>
          {error && (
            <div className="notice notice-err" role="alert" style={{ marginBottom: 14 }}>
              <span style={{ flex: 1 }}>{error}</span>
              <button className="btn btn-sm btn-outline" onClick={reload}>Coba lagi</button>
            </div>
          )}
          <div className="grid">
            {loading
              ? Array.from({ length: 6 }, (_, i) => <EventCardSkeleton key={i} />)
              : list.map((ev) => <EventCard key={ev.id} ev={ev} detail={details[ev.id]} />)}
          </div>
          {!loading && list.length === 0 && (
            <div className="panel empty">
              <div className="empty-icon"><IconSearch size={26} /></div>
              <h2 style={{ fontSize: 18 }}>Event tidak ditemukan</h2>
              <p className="muted">Coba ubah kata kunci atau filter.</p>
              <button className="btn btn-outline" onClick={reset}><IconTicket /> Tampilkan semua</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="container page"><div className="skeleton" style={{ height: 300 }} /></div>}>
      <Explore />
    </Suspense>
  );
}
