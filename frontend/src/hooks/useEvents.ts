'use client';

import { useCallback, useEffect, useState } from 'react';
import { readProvider } from '@/lib/contract';
import { fetchAllEvents } from '@/lib/events';
import { api } from '@/lib/api';
import { EventDetail, OnchainEvent } from '@/lib/types';

// Semua event on-chain + detail off-chain (poster, lokasi, deskripsi).
export function useEvents() {
  const [events, setEvents] = useState<OnchainEvent[]>([]);
  const [details, setDetails] = useState<Record<number, EventDetail | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAllEvents(readProvider());
      setEvents(list);
      const pairs = await Promise.all(
        list.map(async (e) => [e.id, await api.getEventDetail(e.id).catch(() => null)] as const)
      );
      setDetails(Object.fromEntries(pairs));
    } catch {
      setError('Gagal memuat event. Pastikan jaringan blockchain dan backend berjalan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { events, details, loading, error, reload: load };
}
