'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet';
import { useToast } from '@/lib/toast';
import { parseContractError } from '@/lib/contract';
import { IconWallet } from './Icons';

// Satu tombol: connect MetaMask -> tanda tangan pesan SIWE -> JWT.
export function LoginButton({ className = 'btn btn-primary', label = 'Masuk dengan Wallet' }: { className?: string; label?: string }) {
  const { hasWallet, login } = useWallet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!hasWallet) {
    return (
      <a className={className} href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">
        <IconWallet /> Install MetaMask
      </a>
    );
  }
  return (
    <button
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await login();
          toast('Berhasil masuk.', 'success');
        } catch (e: any) {
          toast(e?.status ? e.message : parseContractError(e), 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <IconWallet /> {busy ? 'Menunggu tanda tangan…' : label}
    </button>
  );
}
