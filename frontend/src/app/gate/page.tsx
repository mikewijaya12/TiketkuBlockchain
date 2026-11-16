'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAddress } from 'ethers';
import { getContract, readProvider } from '@/lib/contract';
import { fetchEvent } from '@/lib/events';
import { parseQr, QrPayload } from '@/lib/checkin';
import { useWallet } from '@/lib/wallet';
import { useTx } from '@/hooks/useTx';
import { OnchainEvent } from '@/lib/types';
import { fmtDate, short } from '@/lib/format';
import { Guard } from '@/components/Guard';
import { IconCheck, IconScan, IconX } from '@/components/Icons';

type Check = { payload: QrPayload; holder: string; eventId: number; used: boolean; problems: string[] };
type Log = { tokenId: number; holder: string; ok: boolean; note: string; at: number };

function Gate() {
  const { address } = useWallet();
  const { run, pending } = useTx();
  const [events, setEvents] = useState<OnchainEvent[] | null>(null);
  const [eventId, setEventId] = useState<number | null>(null);
  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState('');
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<Log[]>([]);
  const scanner = useRef<any>(null);
  const busy = useRef(false);

  // Event yang ditugaskan ke wallet ini (log GateUpdated + cek status terkini).
  useEffect(() => {
    if (!address) return;
    (async () => {
      const c = getContract(readProvider());
      try {
        const logs = await c.queryFilter(c.filters.GateUpdated(null, getAddress(address)));
        const ids = Array.from(new Set(logs.map((l: any) => Number(l.args.eventId))));
        const active = await Promise.all(ids.map(async (id) => ((await c.eventGate(id, address)) ? fetchEvent(readProvider(), id) : null)));
        const list = active.filter((e): e is OnchainEvent => !!e && !e.cancelled);
        setEvents(list);
        if (list.length === 1) setEventId(list[0].id);
      } catch {
        setEvents([]);
      }
    })();
  }, [address]);

  const verify = useCallback(async (text: string) => {
    if (busy.current) return;
    busy.current = true;
    setError('');
    setCheck(null);
    try {
      const payload = parseQr(text.trim());
      if (!payload) { setError('QR tidak dikenali. Pastikan ini e-tiket TiketKu.'); return; }
      const c = getContract(readProvider());
      let holder = '';
      try { holder = await c.ownerOf(payload.t); } catch { setError(`Tiket #${payload.t} tidak ada.`); return; }
      const t = await c.tickets(payload.t);
      const evId = Number(t.eventId ?? t[0]);
      const used = Boolean(t.used ?? t[1]);
      const problems: string[] = [];
      if (evId !== eventId) problems.push(`Tiket untuk event #${evId}, bukan event yang sedang kamu jaga.`);
      if (used) problems.push('Tiket sudah dipakai check-in.');
      if (payload.d < Date.now() / 1000) problems.push('QR kedaluwarsa. Minta pengunjung membuat QR baru.');
      setCheck({ payload, holder, eventId: evId, used, problems });
    } finally {
      busy.current = false;
    }
  }, [eventId]);

  // Kamera (html5-qrcode dimuat dinamis hanya di browser).
  useEffect(() => {
    if (!camera) return;
    let stopped = false;
    (async () => {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (stopped) return;
      const s = new Html5Qrcode('qr-reader');
      scanner.current = s;
      try {
        await s.start({ facingMode: 'environment' }, { fps: 8, qrbox: 240 }, (text: string) => verify(text), () => {});
      } catch {
        setError('Kamera tidak bisa dibuka. Izinkan akses kamera atau tempel isi QR secara manual.');
        setCamera(false);
      }
    })();
    return () => {
      stopped = true;
      const s = scanner.current;
      scanner.current = null;
      if (s?.isScanning) s.stop().then(() => s.clear()).catch(() => {});
    };
  }, [camera, verify]);

  const confirm = async () => {
    if (!check) return;
    const { payload, holder } = check;
    const ok = await run('checkin', (c) => c.checkIn(payload.t, payload.d, payload.s), { success: `Tiket #${payload.t} berhasil check-in.` });
    setLogs((l) => [{ tokenId: payload.t, holder, ok, note: ok ? 'Masuk' : 'Ditolak kontrak', at: Date.now() }, ...l].slice(0, 20));
    setCheck(null);
  };

  const ev = events?.find((e) => e.id === eventId);
  const now = Date.now() / 1000;
  const windowOpen = ev ? now + 6 * 3600 >= Number(ev.eventDate) && now <= Number(ev.eventDate) + 86400 : false;

  return (
    <div className="container page">
      <h1 className="page-title">Scan tiket</h1>
      <p className="muted" style={{ margin: '0 0 18px' }}>Pindai QR e-tiket pengunjung. Check-in tercatat di blockchain dan tiket tidak bisa dipakai dua kali.</p>

      <div className="checkout-grid">
        <div className="stack">
          <div className="panel">
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="ev">Event yang dijaga</label>
              {events === null ? <div className="skeleton" style={{ height: 46 }} /> : events.length === 0 ? (
                <div className="notice notice-warn">Kamu belum ditugaskan ke event mana pun. Minta organizer menambahkan wallet kamu di menu Gate.</div>
              ) : (
                <select id="ev" className="select" value={eventId ?? ''} onChange={(e) => { setEventId(Number(e.target.value) || null); setCheck(null); }}>
                  <option value="">Pilih event…</option>
                  {events.map((e) => <option key={e.id} value={e.id}>#{e.id} · {e.name} · {fmtDate(e.eventDate)}</option>)}
                </select>
              )}
            </div>
            {ev && !windowOpen && <div className="notice notice-warn" style={{ marginTop: 12 }}>Check-in hanya bisa 6 jam sebelum sampai 1 hari setelah acara ({fmtDate(ev.eventDate)}).</div>}
          </div>

          {eventId && (
            <div className="panel stack">
              <div className="row between">
                <b>Pemindai</b>
                <button className={`btn btn-sm ${camera ? 'btn-outline' : 'btn-primary'}`} onClick={() => setCamera((c) => !c)}><IconScan /> {camera ? 'Matikan kamera' : 'Nyalakan kamera'}</button>
              </div>
              {camera && <div id="qr-reader" className="scanner" />}
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="man">Atau tempel isi QR</label>
                <textarea id="man" className="textarea mono" rows={3} value={manual} onChange={(e) => setManual(e.target.value)} placeholder='{"v":1,"c":…}' maxLength={400} />
                <button className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }} disabled={!manual.trim()} onClick={() => verify(manual)}>Periksa</button>
              </div>
              {error && <div className="notice notice-err"><IconX /> <span>{error}</span></div>}
            </div>
          )}

          {check && (
            <div className={`panel stack scan-result ${check.problems.length ? 'bad' : 'ok'}`}>
              <div className="row between">
                <b>Tiket #{check.payload.t}</b>
                {check.problems.length ? <span className="badge badge-red">Tidak valid</span> : <span className="badge badge-green">Siap check-in</span>}
              </div>
              <div className="summary-row"><span>Pemilik</span><span className="mono">{short(check.holder)}</span></div>
              <div className="summary-row"><span>Event</span><span>#{check.eventId}</span></div>
              {check.problems.map((p) => <div key={p} className="notice notice-err"><IconX /> <span>{p}</span></div>)}
              <div className="hint">Tanda tangan pemilik diverifikasi oleh smart contract saat konfirmasi.</div>
              <div className="row">
                <button className="btn btn-ghost" onClick={() => setCheck(null)}>Batal</button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={check.problems.length > 0 || pending === 'checkin' || !windowOpen} onClick={confirm}>
                  {pending === 'checkin' ? 'Memproses…' : 'Konfirmasi check-in'}
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="panel sticky">
          <b>Riwayat sesi ini</b>
          {logs.length === 0 ? <p className="muted" style={{ fontSize: 14 }}>Belum ada scan.</p> : (
            <div className="tx-list" style={{ marginTop: 10 }}>
              {logs.map((l) => (
                <div key={l.at} className="tx-item">
                  <span className="row" style={{ gap: 6 }}>{l.ok ? <IconCheck size={16} /> : <IconX size={16} />} #{l.tokenId} <span className="mono muted">{short(l.holder)}</span></span>
                  <span className={`badge ${l.ok ? 'badge-green' : 'badge-red'}`}>{l.note}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function GatePage() {
  return <Guard role="gate"><Gate /></Guard>;
}
