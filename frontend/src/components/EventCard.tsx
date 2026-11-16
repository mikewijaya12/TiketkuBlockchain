import Link from 'next/link';
import { OnchainEvent, EventDetail } from '@/lib/types';
import { eth, eventStatus, fmtDateShort } from '@/lib/format';
import { Poster } from './Poster';
import { IconCalendar, IconPin } from './Icons';

export function EventCard({ ev, detail }: { ev: OnchainEvent; detail?: EventDetail | null }) {
  const st = eventStatus(ev);
  const pct = Number(ev.maxSupply) ? Math.min(100, Math.round((Number(ev.sold) / Number(ev.maxSupply)) * 100)) : 0;
  const left = Number(ev.maxSupply - ev.sold);
  return (
    <Link href={`/events/${ev.id}`} className="card event-card">
      <Poster id={ev.id} name={ev.name} url={detail?.posterUrl}>
        <span className={`badge ${st.cls}`}>{st.label}</span>
      </Poster>
      <div className="event-body">
        <div className="event-title">{ev.name}</div>
        <div className="meta"><IconCalendar size={14} /> {fmtDateShort(ev.eventDate)}</div>
        <div className="meta"><IconPin size={14} /> {detail?.location || 'Lokasi segera diumumkan'}</div>
        {st.label === 'Tersedia' && (
          <div style={{ marginTop: 4 }}>
            <div className="stock"><div style={{ width: `${pct}%` }} /></div>
            <div className="hint" style={{ marginTop: 4 }}>{left <= 10 ? `Sisa ${left} tiket!` : `${pct}% terjual`}</div>
          </div>
        )}
        <div className="event-foot">
          <div>
            <div className="from">Mulai dari</div>
            <div className="price">{eth(ev.price)}</div>
          </div>
          <span className="badge badge-blue">NFT</span>
        </div>
      </div>
    </Link>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="card event-card">
      <div className="poster skeleton" style={{ borderRadius: 0 }} />
      <div className="event-body">
        <div className="skeleton" style={{ height: 18, width: '80%' }} />
        <div className="skeleton" style={{ height: 14, width: '50%' }} />
        <div className="skeleton" style={{ height: 14, width: '60%' }} />
        <div className="skeleton" style={{ height: 22, width: '40%', marginTop: 12 }} />
      </div>
    </div>
  );
}
