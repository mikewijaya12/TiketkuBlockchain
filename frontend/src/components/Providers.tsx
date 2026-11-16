'use client';

import { WalletProvider } from '@/lib/wallet';
import { ToastProvider } from '@/lib/toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <WalletProvider>{children}</WalletProvider>
    </ToastProvider>
  );
}
