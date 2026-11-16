'use client';

import Link from 'next/link';
import { useWallet } from '@/lib/wallet';
import { CHAINS, CHAIN_ID } from '@/lib/config';
import { LoginButton } from './LoginButton';
import { IconLock, IconShield, IconWallet } from './Icons';

type Role = 'admin' | 'organizer' | 'gate';
const ROLE_NAME: Record<Role, string> = { admin: 'Admin', organizer: 'Event Organizer', gate: 'Gate Staff' };

function Box({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="container page">
      <div className="panel empty" style={{ maxWidth: 520, margin: '40px auto' }}>
        <div className="empty-icon">{icon}</div>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>{title}</h2>
        <div className="stack" style={{ alignItems: 'center' }}>{children}</div>
      </div>
    </div>
  );
}

// Lindungi halaman: wajib login wallet, jaringan benar, dan (opsional) role tertentu.
// Catatan: ini hanya UX. Otorisasi sebenarnya ada di smart contract & backend.
export function Guard({ role, children }: { role?: Role; children: React.ReactNode }) {
  const { ready, authed, chainOk, roles, switchChain } = useWallet();

  if (!ready) {
    return <div className="container page"><div className="skeleton" style={{ height: 240 }} /></div>;
  }
  if (!authed) {
    return (
      <Box icon={<IconWallet size={28} />} title="Masuk dulu, yuk">
        <p className="muted" style={{ margin: 0 }}>Hubungkan MetaMask dan tanda tangani pesan login. Tidak ada biaya gas untuk login.</p>
        <LoginButton />
      </Box>
    );
  }
  if (!chainOk) {
    return (
      <Box icon={<IconShield size={28} />} title="Jaringan wallet belum sesuai">
        <p className="muted" style={{ margin: 0 }}>TiketKu berjalan di jaringan <b>{CHAINS[CHAIN_ID]?.chainName}</b>.</p>
        <button className="btn btn-primary" onClick={() => switchChain().catch(() => {})}>Ganti jaringan</button>
      </Box>
    );
  }
  if (role && !roles?.[role]) {
    return (
      <Box icon={<IconLock size={28} />} title={`Khusus ${ROLE_NAME[role]}`}>
        <p className="muted" style={{ margin: 0 }}>Wallet Anda belum memiliki role {ROLE_NAME[role]} di smart contract.</p>
        {role === 'organizer' && <Link className="btn btn-primary" href="/profile#eo">Ajukan jadi Event Organizer</Link>}
        <Link className="btn btn-ghost" href="/">Kembali ke beranda</Link>
      </Box>
    );
  }
  return <>{children}</>;
}
