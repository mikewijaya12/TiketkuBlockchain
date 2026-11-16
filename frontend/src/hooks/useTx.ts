'use client';

import { useCallback, useState } from 'react';
import { Contract, ContractTransactionResponse } from 'ethers';
import { useWallet } from '@/lib/wallet';
import { useToast } from '@/lib/toast';
import { getContract, parseContractError } from '@/lib/contract';
import { CHAIN_ID } from '@/lib/config';

// Jalankan transaksi kontrak dengan pengecekan wallet & jaringan, toast, dan pesan error Indonesia.
export function useTx() {
  const { signer, provider } = useWallet();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async (
      key: string,
      fn: (c: Contract) => Promise<ContractTransactionResponse>,
      opts: { success?: string; silent?: boolean } = {}
    ): Promise<boolean> => {
      if (!signer || !provider) {
        toast('Hubungkan wallet terlebih dulu.', 'error');
        return false;
      }
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== CHAIN_ID) {
        toast('Jaringan wallet salah. Ganti jaringan dulu.', 'error');
        return false;
      }
      setPending(key);
      try {
        const tx = await fn(getContract(signer));
        if (!opts.silent) toast('Transaksi dikirim, menunggu konfirmasi…');
        await tx.wait();
        if (opts.success) toast(opts.success, 'success');
        return true;
      } catch (e) {
        toast(parseContractError(e), 'error');
        return false;
      } finally {
        setPending(null);
      }
    },
    [signer, provider, toast]
  );

  return { run, pending };
}
