'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getContract, readProvider } from '@/lib/contract';
import { fetchAllEvents } from '@/lib/events';
import { api } from '@/lib/api';
import { useWallet } from '@/lib/wallet';
import { useTx } from '@/hooks/useTx';
import { OnchainEvent } from '@/lib/types';
import { eth, eventStatus, fmtDate } from '@/lib/format';
import { Guard } from '@/components/Guard';
import { Modal } from '@/components/Modal';
import { GateModal } from '@/components/GateModal';
import { Balance } from '@/components/Balance';
import { IconPlus, IconTicket } from '@/components/Icons';

const CLAIM_DELAY = 86400;
const CANCEL_CUTOFF = 6 * 3600;
type Row = OnchainEvent & { escrow: bigint; claimed: boolean };

function Dashboard() {
  const { address } = useWallet();
  const { run, pending } = useTx();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [gateFor, setGateFor] = useState<OnchainEvent | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'cancel' | 'delete'; ev: Row } | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!address) return;
    const p = readProvider();
    const c = getContract(p);
    const mine = (await fetchAllEvents(p)).filter((e) => e.organizer.toLowerCase() === address);
    const full = await Promise.all(mine.map(async (e) => ({ ...e, escrow: await c.escrow(e.id) as bigint, claimed: await c.revenueClaimed(e.id) as boolean })));
    setRows(full.sort((a, b) => Number(b.eventDate - a.eventDate)));
    setTick((t) => t + 1);
  }, [address]);
  useEffect(() => { load(); }, [load]);

  const kpi = useMemo(() => {
    const r = rows ?? [];
    const now = Date.now() / 1000;
    return {
      active: r.filter((e) => !e.cancelled && Number(e.eventDate) > now).length,
      sold: r.reduce((s, e) => s + Number(e.sold), 0),
      escrow: r.reduce((s, e) => s + e.escrow, 0n),
      claimable: r.filter((e) => !e.cancelled && !e.claimed && e.escrow > 0n && now >= Number(e.eventDate) + CLAIM_DELAY).length,
    };
  }, [rows]);

  const now = Date.now() / 1000;

  return (
    <div className="container page">
      <div className="row between wrap" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="page-title">Dashboard Event Organizer</h1>
          <div className="muted">Kelola event, petugas gate, dan pendapatan kamu.</div>
        </div>
        <Link href="/organizer/events/new" className="btn btn-primary"><IconPlus /> Buat event</Link>
      </div>

      <div className="kpis">
        <div className="panel kpi"><div className="kpi-label">Event aktif</div><div className="kpi-value">{rows ? kpi.active : '–'}</div></div>
        <div className="panel kpi"><div className="kpi-label">Tiket terjual</div><div className="kpi-value">{rows ? kpi.sold : '–'}</div></div>
        <div className="panel kpi"><div className="kpi-label">Dana di escrow</div><div className="kpi-value" style={{ fontSize: 20 }}>{rows ? eth(kpi.escrow) : '–'}</div></div>
        <div className="panel kpi"><div className="kpi-label">Siap diklaim</div><div className="kpi-value">{rows ? kpi.claimable : '–'}</div></div>
      </div>

      <div style={{ marginTop: 16 }}><Balance refreshKey={tick} hint="Pendapatan event yang sudah diklaim." /></div>

      <div className="panel section" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px' }}><h2 style={{ fontSize: 17 }}>Event saya</h2></div>
        {rows === null ? <div className="skeleton" style={{ height: 160, margin: 20 }} /> : rows.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><IconTicket size={28} /></div>
            <p className="muted">Belum ada event. Buat event pertamamu!</p>
            <Link href="/organizer/events/new" className="btn btn-primary"><IconPlus /> Buat event</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Event</th><th>Tanggal</th><th>Terjual</th><th>Escrow</th><th>Status</th><th style={{ textAlign: 'right' }}>Aksi</th></tr></thead>
              <tbody>
                {rows.map((e) => {
                  const st = eventStatus(e);
                  const before = now < Number(e.eventDate);
                  const canCancel = now + CANCEL_CUTOFF < Number(e.eventDate);
                  const claimAt = Number(e.eventDate) + CLAIM_DELAY;
                  const canClaim = !e.cancelled && !e.claimed && e.escrow > 0n && now >= claimAt;
                  return (
                    <tr key={e.id}>
                      <td><Link href={`/events/${e.id}`} className="link">{e.name}</Link><div className="hint">#{e.id} · {eth(e.price)}</div></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.eventDate)}</td>
                      <td>{e.sold.toString()}/{e.maxSupply.toString()}</td>
                      <td>{e.claimed ? <span className="badge badge-green">Diklaim</span> : eth(e.escrow)}</td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td>
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
                          {!e.cancelled && <Link href={`/organizer/events/${e.id}`} className="btn btn-sm btn-outline">Edit</Link>}
                          {!e.cancelled && before && <button className="btn btn-sm btn-outline" onClick={() => setGateFor(e)}>Gate</button>}
                          {canClaim && (
                            <button className="btn btn-sm btn-accent" disabled={pending === `claim-${e.id}`} onClick={async () => {
                              if (await run(`claim-${e.id}`, (c) => c.claimRevenue(e.id), { success: 'Pendapatan diklaim. Tarik dari saldo.' })) load();
                            }}>Klaim</button>
                          )}
                          {!e.cancelled && !e.claimed && !canClaim && !before && e.escrow > 0n && <span className="hint">Klaim mulai {fmtDate(claimAt)}</span>}
                          {e.sold === 0n ? (
                            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red-500)' }} onClick={() => setConfirm({ kind: 'delete', ev: e })}>Hapus</button>
                          ) : !e.cancelled && canCancel ? (
                            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red-500)' }} onClick={() => setConfirm({ kind: 'cancel', ev: e })}>Batalkan</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {gateFor && <GateModal ev={gateFor} onClose={() => setGateFor(null)} />}
      {confirm && (
        <Modal title={confirm.kind === 'delete' ? 'Hapus event?' : 'Batalkan event?'} onClose={() => setConfirm(null)}>
          <p style={{ marginTop: 0 }}>
            {confirm.kind === 'delete'
              ? <>Event <b>{confirm.ev.name}</b> belum punya penjualan dan akan dihapus permanen dari blockchain.</>
              : <>Event <b>{confirm.ev.name}</b> sudah menjual {confirm.ev.sold.toString()} tiket. Semua pembeli (termasuk pembeli resale) akan bisa <b>refund penuh</b> dan kamu tidak bisa mengklaim pendapatan. Tindakan ini tidak bisa dibatalkan.</>}
          </p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Kembali</button>
            <button className="btn btn-danger" disabled={!!pending} onClick={async () => {
              const { kind, ev } = confirm;
              const ok = await run(kind, (c) => (kind === 'delete' ? c.deleteEvent(ev.id) : c.cancelEvent(ev.id)), {
                success: kind === 'delete' ? 'Event dihapus.' : 'Event dibatalkan. Pembeli bisa refund.',
              });
              if (ok && kind === 'delete') await api.deleteEventDetail(ev.id).catch(() => {});
              if (ok) { setConfirm(null); load(); }
            }}>{confirm.kind === 'delete' ? 'Ya, hapus' : 'Ya, batalkan event'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function OrganizerPage() {
  return <Guard role="organizer"><Dashboard /></Guard>;
}
