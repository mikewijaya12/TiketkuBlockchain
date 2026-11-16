'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { readProvider } from '@/lib/contract';
import { fetchEvent } from '@/lib/events';
import { api } from '@/lib/api';
import { useWallet } from '@/lib/wallet';
import { EventDetail, OnchainEvent } from '@/lib/types';
import { Guard } from '@/components/Guard';
import { EventForm } from '@/components/EventForm';

function Edit() {
  const { id } = useParams<{ id: string }>();
  const { address } = useWallet();
  const [ev, setEv] = useState<OnchainEvent | null | undefined>(undefined);
  const [detail, setDetail] = useState<EventDetail | null | undefined>(undefined);

  useEffect(() => {
    fetchEvent(readProvider(), Number(id)).then(setEv).catch(() => setEv(null));
    api.getEventDetail(Number(id)).then(setDetail).catch(() => setDetail(null));
  }, [id]);

  if (ev === undefined || detail === undefined) return <div className="skeleton" style={{ height: 400 }} />;
  if (!ev || ev.organizer.toLowerCase() !== address) {
    return <div className="panel empty"><h2 style={{ fontSize: 18 }}>Event tidak ditemukan atau bukan milik kamu</h2></div>;
  }
  return <EventForm ev={ev} detail={detail} />;
}

export default function EditEventPage() {
  return (
    <Guard role="organizer">
      <div className="container page" style={{ maxWidth: 820 }}>
        <Link href="/organizer" className="link">← Dashboard EO</Link>
        <h1 className="page-title" style={{ marginTop: 8, marginBottom: 18 }}>Edit event</h1>
        <Edit />
      </div>
    </Guard>
  );
}
