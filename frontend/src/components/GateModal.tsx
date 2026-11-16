'use client';

import { useCallback, useEffect, useState } from 'react';
import { isAddress, getAddress } from 'ethers';
import { getContract, readProvider } from '@/lib/contract';
import { useTx } from '@/hooks/useTx';
import { OnchainEvent } from '@/lib/types';
import { short } from '@/lib/format';
import { Modal } from './Modal';
import { IconInfo } from './Icons';

// Organizer menugaskan / mencabut petugas gate untuk event miliknya.
export function GateModal({ ev, onClose }: { ev: OnchainEvent; onClose: () => void }) {
  const { run, pending } = useTx();
  const [gates, setGates] = useState<string[] | null>(null);
  const [addr, setAddr] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const c = getContract(readProvider());
    try {
      // Kumpulkan dari log GateUpdated, lalu cek status terkini on-chain.
      const logs = await c.queryFilter(c.filters.GateUpdated(ev.id));
      const uniq = Array.from(new Set(logs.map((l: any) => getAddress(l.args.gate as string))));
      const active = await Promise.all(uniq.map(async (g) => ((await c.eventGate(ev.id, g)) ? g : null)));
      setGates(active.filter(Boolean) as string[]);
    } catch {
      setGates([]);
    }
  }, [ev.id]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setErr('');
    if (!isAddress(addr)) return setErr('Alamat wallet tidak valid');
    const c = getContract(readProvider());
    if (!(await c.hasRole(await c.GATE_ROLE(), addr))) return setErr('Wallet ini belum punya GATE_ROLE. Minta Admin memberikannya dulu.');
    if (await run('gate-add', (k) => k.setEventGate(ev.id, addr, true), { success: 'Petugas gate ditambahkan.' })) {
      setAddr('');
      load();
    }
  };

  return (
    <Modal title={`Petugas gate · ${ev.name}`} onClose={onClose} width={520}>
      <div className="stack">
        <div className="notice notice-info"><IconInfo /> <span>Hanya petugas yang ditugaskan di sini yang bisa check-in tiket event ini.</span></div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ga">Alamat wallet petugas</label>
          <div className="row">
            <input id="ga" className="input mono" placeholder="0x…" value={addr} onChange={(e) => setAddr(e.target.value.trim())} />
            <button className="btn btn-primary" disabled={!addr || pending === 'gate-add'} onClick={add}>Tambah</button>
          </div>
          {err && <div className="err-text">{err}</div>}
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Petugas aktif</div>
          {gates === null ? <div className="skeleton" style={{ height: 40 }} /> : gates.length === 0 ? <div className="muted" style={{ fontSize: 14 }}>Belum ada petugas.</div> : (
            <div className="tx-list">
              {gates.map((g) => (
                <div key={g} className="tx-item">
                  <span className="mono">{short(g)}</span>
                  <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red-500)' }} disabled={pending === `gate-rm-${g}`} onClick={async () => {
                    if (await run(`gate-rm-${g}`, (k) => k.setEventGate(ev.id, g, false), { success: 'Petugas dicabut.' })) load();
                  }}>Cabut</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
