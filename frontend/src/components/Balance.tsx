'use client';

import { useCallback, useEffect, useState } from 'react';
import { getContract, readProvider } from '@/lib/contract';
import { useWallet } from '@/lib/wallet';
import { useTx } from '@/hooks/useTx';
import { eth } from '@/lib/format';
import { IconWallet } from './Icons';

// Saldo pull-payment (hasil resale, refund, atau klaim pendapatan EO).
export function Balance({ refreshKey = 0, hint }: { refreshKey?: number; hint?: string }) {
  const { address } = useWallet();
  const { run, pending } = useTx();
  const [amount, setAmount] = useState<bigint>(0n);

  const load = useCallback(async () => {
    if (!address) return;
    setAmount(await getContract(readProvider()).pendingWithdrawals(address).catch(() => 0n));
  }, [address]);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (amount === 0n) return null;
  return (
    <div className="panel balance-bar">
      <div className="row">
        <span className="info-icon" style={{ background: '#fff3d6', color: 'var(--accent-600)' }}><IconWallet /></span>
        <div>
          <div style={{ fontWeight: 700 }}>Saldo siap ditarik: <span className="price">{eth(amount)}</span></div>
          <div className="hint">{hint ?? 'Dari penjualan resale atau refund.'}</div>
        </div>
      </div>
      <button className="btn btn-accent" disabled={pending === 'withdraw'} onClick={async () => {
        if (await run('withdraw', (c) => c.withdraw(), { success: 'Saldo berhasil ditarik ke wallet.' })) load();
      }}>{pending === 'withdraw' ? 'Memproses…' : 'Tarik ke wallet'}</button>
    </div>
  );
}
