'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { getAddress, isAddress } from 'ethers';
import { getContract, readProvider } from '@/lib/contract';
import { fetchAllEvents } from '@/lib/events';
import { api } from '@/lib/api';
import { useWallet } from '@/lib/wallet';
import { useToast } from '@/lib/toast';
import { useTx } from '@/hooks/useTx';
import { OnchainEvent } from '@/lib/types';
import { eth, eventStatus, fmtDate, short } from '@/lib/format';
import { Guard } from '@/components/Guard';
import { Modal } from '@/components/Modal';
import { IconChart, IconShield, IconTicket, IconUsers, IconInfo } from '@/components/Icons';

type Tab = 'overview' | 'apps' | 'roles' | 'events';
type App = Awaited<ReturnType<typeof api.listApplications>>[number];
const ROLE_KEYS = { ORGANIZER: 'ORGANIZER_ROLE', GATE: 'GATE_ROLE', ADMIN: 'DEFAULT_ADMIN_ROLE' } as const;
type RoleKey = keyof typeof ROLE_KEYS;

async function roleHash(k: RoleKey): Promise<string> {
  const c = getContract(readProvider());
  return k === 'ORGANIZER' ? c.ORGANIZER_ROLE() : k === 'GATE' ? c.GATE_ROLE() : c.DEFAULT_ADMIN_ROLE();
}

function Overview({ events, onPauseChange }: { events: OnchainEvent[] | null; onPauseChange: () => void }) {
  const { run, pending } = useTx();
  const [paused, setPaused] = useState<boolean | null>(null);
  const [pendingApps, setPendingApps] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    setPaused(await getContract(readProvider()).paused());
    setPendingApps((await api.listApplications('pending').catch(() => [])).length);
  }, []);
  useEffect(() => { load(); }, [load]);

  const now = Date.now() / 1000;
  const list = events ?? [];
  return (
    <div className="stack">
      <div className="kpis">
        <div className="panel kpi"><div className="kpi-label">Total event</div><div className="kpi-value">{events ? list.length : '–'}</div></div>
        <div className="panel kpi"><div className="kpi-label">Event aktif</div><div className="kpi-value">{events ? list.filter((e) => !e.cancelled && Number(e.eventDate) > now).length : '–'}</div></div>
        <div className="panel kpi"><div className="kpi-label">Tiket terjual</div><div className="kpi-value">{events ? list.reduce((s, e) => s + Number(e.sold), 0) : '–'}</div></div>
        <div className="panel kpi"><div className="kpi-label">Pengajuan EO menunggu</div><div className="kpi-value">{pendingApps ?? '–'}</div></div>
      </div>
      <div className="panel row between wrap">
        <div>
          <div style={{ fontWeight: 700 }}>Status kontrak: {paused === null ? '…' : paused ? <span className="badge badge-red">Dijeda</span> : <span className="badge badge-green">Berjalan</span>}</div>
          <div className="hint" style={{ maxWidth: 520 }}>Jeda darurat menghentikan pembuatan event, pembelian, resale, dan check-in. Penarikan dana dan refund tetap berjalan.</div>
        </div>
        <button className={`btn ${paused ? 'btn-primary' : 'btn-danger'}`} disabled={paused === null || !!pending} onClick={() => setConfirm(true)}>
          {paused ? 'Lanjutkan kontrak' : 'Jeda darurat'}
        </button>
      </div>
      {confirm && (
        <Modal title={paused ? 'Lanjutkan kontrak?' : 'Jeda kontrak?'} onClose={() => setConfirm(false)}>
          <p style={{ marginTop: 0 }}>{paused ? 'Semua fitur akan aktif kembali.' : 'Semua pembelian, resale, dan check-in akan berhenti sampai dilanjutkan.'}</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Batal</button>
            <button className={`btn ${paused ? 'btn-primary' : 'btn-danger'}`} disabled={!!pending} onClick={async () => {
              const ok = await run('pause', (c) => (paused ? c.unpause() : c.pause()), { success: paused ? 'Kontrak dilanjutkan.' : 'Kontrak dijeda.' });
              if (ok) { setConfirm(false); load(); onPauseChange(); }
            }}>Ya, lanjut</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Applications() {
  const toast = useToast();
  const { run, pending } = useTx();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [apps, setApps] = useState<App[] | null>(null);
  const [onchain, setOnchain] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setApps(null);
    try {
      const list = await api.listApplications(status);
      setApps(list);
      const c = getContract(readProvider());
      const r = await roleHash('ORGANIZER');
      setOnchain(Object.fromEntries(await Promise.all(list.map(async (a) => [a.address, await c.hasRole(r, a.address)] as const))));
    } catch (e: any) {
      toast(e.message, 'error');
      setApps([]);
    }
  }, [status, toast]);
  useEffect(() => { load(); }, [load]);

  const approve = async (a: App) => {
    // 1) beri role di kontrak (sumber kebenaran), 2) tandai di database.
    if (!onchain[a.address]) {
      const r = await roleHash('ORGANIZER');
      const ok = await run(`ap-${a.address}`, (c) => c.grantRole(r, a.address), { silent: true });
      if (!ok) return;
    }
    try {
      await api.reviewApplication(a.address, 'approved');
      toast(`${a.organizationName} sekarang Event Organizer.`, 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
    load();
  };

  return (
    <div className="panel" style={{ padding: 0 }}>
      <div className="row between wrap" style={{ padding: '16px 20px' }}>
        <h2 style={{ fontSize: 17 }}>Pengajuan Event Organizer</h2>
        <div className="chips">
          {(['pending', 'approved', 'rejected'] as const).map((s) => (
            <button key={s} className={`chip ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
              {s === 'pending' ? 'Menunggu' : s === 'approved' ? 'Disetujui' : 'Ditolak'}
            </button>
          ))}
        </div>
      </div>
      {apps === null ? <div className="skeleton" style={{ height: 120, margin: 20 }} /> : apps.length === 0 ? (
        <div className="empty muted">Tidak ada pengajuan.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Organisasi</th><th>Wallet</th><th>Kontak</th><th>Diajukan</th><th>Role on-chain</th><th style={{ textAlign: 'right' }}>Aksi</th></tr></thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.address}>
                  <td><b>{a.organizationName}</b>{a.description && <div className="hint" style={{ maxWidth: 280 }}>{a.description}</div>}</td>
                  <td className="mono">{short(a.address)}</td>
                  <td>{a.contactEmail}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{a.createdAt && !isNaN(Date.parse(a.createdAt)) ? new Date(a.createdAt).toLocaleDateString('id-ID') : '-'}</td>
                  <td>{onchain[a.address] ? <span className="badge badge-green">Aktif</span> : <span className="badge badge-gray">Belum</span>}</td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      {(status !== 'approved' || !onchain[a.address]) && (
                        <button className="btn btn-sm btn-primary" disabled={pending === `ap-${a.address}`} onClick={() => approve(a)}>
                          {status === 'approved' ? 'Aktifkan role' : 'Setujui'}
                        </button>
                      )}
                      {status === 'pending' && (
                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red-500)' }} onClick={async () => {
                          try { await api.reviewApplication(a.address, 'rejected'); toast('Pengajuan ditolak.'); load(); } catch (e: any) { toast(e.message, 'error'); }
                        }}>Tolak</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Roles() {
  const { address } = useWallet();
  const { run, pending } = useTx();
  const [addr, setAddr] = useState('');
  const [role, setRole] = useState<RoleKey>('GATE');
  const [current, setCurrent] = useState<Record<RoleKey, boolean> | null>(null);
  const [confirm, setConfirm] = useState<'grant' | 'revoke' | null>(null);
  const valid = isAddress(addr);

  const check = useCallback(async () => {
    if (!isAddress(addr)) return setCurrent(null);
    const c = getContract(readProvider());
    const keys: RoleKey[] = ['ADMIN', 'ORGANIZER', 'GATE'];
    const vals = await Promise.all(keys.map(async (k) => c.hasRole(await roleHash(k), addr)));
    setCurrent(Object.fromEntries(keys.map((k, i) => [k, vals[i]])) as Record<RoleKey, boolean>);
  }, [addr]);
  useEffect(() => { check(); }, [check]);

  const self = valid && getAddress(addr).toLowerCase() === address;
  const has = current?.[role];

  return (
    <div className="panel">
      <h2 style={{ fontSize: 17, marginBottom: 4 }}>Kelola role</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>Role disimpan di smart contract. Backend dan frontend selalu membaca dari sana.</p>
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="ra">Alamat wallet</label>
          <input id="ra" className="input mono" placeholder="0x…" value={addr} onChange={(e) => setAddr(e.target.value.trim())} />
          {addr && !valid && <div className="err-text">Alamat tidak valid</div>}
        </div>
        <div className="field">
          <label htmlFor="rr">Role</label>
          <select id="rr" className="select" value={role} onChange={(e) => setRole(e.target.value as RoleKey)}>
            <option value="GATE">Gate Staff</option>
            <option value="ORGANIZER">Event Organizer</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div className="field">
          <label>Role saat ini</label>
          <div className="row wrap" style={{ minHeight: 46 }}>
            {!current ? <span className="muted">–</span> : (
              <>
                {current.ADMIN && <span className="badge badge-accent">Admin</span>}
                {current.ORGANIZER && <span className="badge badge-blue">Organizer</span>}
                {current.GATE && <span className="badge badge-green">Gate</span>}
                {!current.ADMIN && !current.ORGANIZER && !current.GATE && <span className="badge badge-gray">Buyer saja</span>}
              </>
            )}
          </div>
        </div>
      </div>
      {role === 'ADMIN' && <div className="notice notice-warn" style={{ marginBottom: 12 }}><IconInfo /> <span>Admin bisa memberi/mencabut semua role dan menjeda kontrak. Berikan hanya ke wallet tepercaya (idealnya multisig).</span></div>}
      <div className="row">
        <button className="btn btn-primary" disabled={!valid || !current || has || !!pending} onClick={() => setConfirm('grant')}>Berikan role</button>
        <button className="btn btn-outline" disabled={!valid || !current || !has || (self && role === 'ADMIN') || !!pending} onClick={() => setConfirm('revoke')}>Cabut role</button>
      </div>
      {self && role === 'ADMIN' && <div className="hint" style={{ marginTop: 6 }}>Tidak bisa mencabut role Admin dari diri sendiri di sini.</div>}
      {confirm && (
        <Modal title={confirm === 'grant' ? 'Berikan role?' : 'Cabut role?'} onClose={() => setConfirm(null)}>
          <p style={{ marginTop: 0 }}>{confirm === 'grant' ? 'Berikan' : 'Cabut'} role <b>{role}</b> {confirm === 'grant' ? 'ke' : 'dari'} <span className="mono">{short(addr)}</span>?</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Batal</button>
            <button className="btn btn-primary" disabled={!!pending} onClick={async () => {
              const h = await roleHash(role);
              const ok = await run('role', (c) => (confirm === 'grant' ? c.grantRole(h, addr) : c.revokeRole(h, addr)), { success: 'Role diperbarui.' });
              if (ok) { setConfirm(null); check(); }
            }}>Ya</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Moderation({ events, reload }: { events: OnchainEvent[] | null; reload: () => void }) {
  const { run, pending } = useTx();
  const [confirm, setConfirm] = useState<{ kind: 'cancel' | 'delete'; ev: OnchainEvent } | null>(null);
  // Status tambahan per event: organizer masih aktif? dana sudah diklaim?
  const [extra, setExtra] = useState<Record<number, { revoked: boolean; claimed: boolean }>>({});
  useEffect(() => {
    if (!events) return;
    const c = getContract(readProvider());
    (async () => {
      const r = await roleHash('ORGANIZER');
      const pairs = await Promise.all(events.map(async (e) => [e.id, {
        revoked: !(await c.hasRole(r, e.organizer)),
        claimed: await c.revenueClaimed(e.id),
      }] as const));
      setExtra(Object.fromEntries(pairs));
    })().catch(() => {});
  }, [events]);
  const now = Date.now() / 1000;
  return (
    <div className="panel" style={{ padding: 0 }}>
      <div style={{ padding: '16px 20px' }}>
        <h2 style={{ fontSize: 17 }}>Moderasi event</h2>
        <div className="hint">Admin bisa membatalkan event bermasalah sampai 6 jam sebelum acara, supaya semua pembeli bisa refund penuh. Jika role organizer sudah dicabut, pembatalan bisa kapan saja selama dana belum diklaim (tiket yang sudah dipakai tidak di-refund).</div>
      </div>
      {events === null ? <div className="skeleton" style={{ height: 120, margin: 20 }} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Event</th><th>Organizer</th><th>Tanggal</th><th>Terjual</th><th>Status</th><th style={{ textAlign: 'right' }}>Aksi</th></tr></thead>
            <tbody>
              {events.map((e) => {
                const st = eventStatus(e);
                const x = extra[e.id];
                // Normal: sampai 6 jam sebelum acara. Organizer dicabut: kapan saja selama dana belum diklaim.
                const canCancel = !e.cancelled && e.sold > 0n && !x?.claimed && (now + 6 * 3600 < Number(e.eventDate) || !!x?.revoked);
                return (
                  <tr key={e.id}>
                    <td><Link className="link" href={`/events/${e.id}`}>{e.name}</Link><div className="hint">#{e.id} · {eth(e.price)}</div></td>
                    <td className="mono">{short(e.organizer)}{extra[e.id]?.revoked && <div><span className="badge badge-red">Role dicabut</span></div>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.eventDate)}</td>
                    <td>{e.sold.toString()}/{e.maxSupply.toString()}</td>
                    <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      {e.sold === 0n ? <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red-500)' }} onClick={() => setConfirm({ kind: 'delete', ev: e })}>Hapus</button>
                        : canCancel ? <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red-500)' }} onClick={() => setConfirm({ kind: 'cancel', ev: e })}>Batalkan</button>
                        : <span className="hint">–</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {confirm && (
        <Modal title={confirm.kind === 'delete' ? 'Hapus event?' : 'Batalkan event?'} onClose={() => setConfirm(null)}>
          <p style={{ marginTop: 0 }}>{confirm.kind === 'delete' ? <>Hapus <b>{confirm.ev.name}</b> (belum ada penjualan)?</> : <>Batalkan <b>{confirm.ev.name}</b>? {confirm.ev.sold.toString()} pembeli akan bisa refund penuh dan organizer tidak bisa klaim dana.</>}</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Kembali</button>
            <button className="btn btn-danger" disabled={!!pending} onClick={async () => {
              const { kind, ev } = confirm;
              const ok = await run(`mod-${ev.id}`, (c) => (kind === 'delete' ? c.deleteEvent(ev.id) : c.cancelEvent(ev.id)), { success: kind === 'delete' ? 'Event dihapus.' : 'Event dibatalkan.' });
              if (ok) { setConfirm(null); reload(); }
            }}>Ya</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Admin() {
  const [tab, setTab] = useState<Tab>('overview');
  const [events, setEvents] = useState<OnchainEvent[] | null>(null);
  const load = useCallback(() => {
    fetchAllEvents(readProvider()).then((l) => setEvents(l.sort((a, b) => b.id - a.id))).catch(() => setEvents([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const items: [Tab, string, React.ReactNode][] = [
    ['overview', 'Ringkasan', <IconChart key="a" />],
    ['apps', 'Pengajuan EO', <IconUsers key="b" />],
    ['roles', 'Kelola role', <IconShield key="c" />],
    ['events', 'Moderasi event', <IconTicket key="d" />],
  ];
  return (
    <div className="container page">
      <h1 className="page-title">Panel Admin</h1>
      <p className="muted" style={{ margin: '0 0 18px' }}>Kelola role, pengajuan organizer, dan keamanan platform.</p>
      <div className="dash">
        <nav className="panel side" aria-label="Menu admin">
          <div className="side-title">Menu</div>
          {items.map(([k, l, i]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{i} {l}</button>)}
        </nav>
        <div>
          {tab === 'overview' && <Overview events={events} onPauseChange={load} />}
          {tab === 'apps' && <Applications />}
          {tab === 'roles' && <Roles />}
          {tab === 'events' && <Moderation events={events} reload={load} />}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return <Guard role="admin"><Admin /></Guard>;
}
