'use client';

import Link from 'next/link';
import { Guard } from '@/components/Guard';
import { EventForm } from '@/components/EventForm';

export default function NewEventPage() {
  return (
    <Guard role="organizer">
      <div className="container page" style={{ maxWidth: 820 }}>
        <Link href="/organizer" className="link">← Dashboard EO</Link>
        <h1 className="page-title" style={{ marginTop: 8 }}>Buat event baru</h1>
        <p className="muted" style={{ margin: '0 0 18px' }}>Data tiket disimpan di smart contract dan tidak bisa diubah setelah ada pembeli.</p>
        <EventForm />
      </div>
    </Guard>
  );
}
