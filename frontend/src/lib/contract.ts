import { BrowserProvider, Contract, Interface, JsonRpcProvider, JsonRpcSigner, Network } from 'ethers';
import { EVENT_TICKET_ABI, CONTRACT_ERRORS } from './abi';
import { CHAIN_ID, CONTRACT_ADDRESS, RPC_URL } from './config';

const iface = new Interface(EVENT_TICKET_ABI);

let _read: JsonRpcProvider | null = null;

// Provider baca-saja (tanpa MetaMask) untuk halaman publik.
export function readProvider() {
  if (!_read) {
    _read = new JsonRpcProvider(RPC_URL, Network.from(CHAIN_ID), { staticNetwork: true });
  }
  return _read;
}

export type Runner = BrowserProvider | JsonRpcSigner | JsonRpcProvider;

export function getContract(runner: Runner) {
  return new Contract(CONTRACT_ADDRESS, EVENT_TICKET_ABI, runner);
}

// Terjemahkan custom error / revert kontrak menjadi pesan Indonesia.
export function parseContractError(err: any): string {
  // Penolakan user di MetaMask
  if (err?.code === 'ACTION_REJECTED' || err?.code === 4001) {
    return 'Transaksi dibatalkan di wallet.';
  }
  const data = err?.data || err?.info?.error?.data || err?.error?.data;
  if (data && typeof data === 'string' && data.startsWith('0x')) {
    try {
      const parsed = iface.parseError(data);
      if (parsed && CONTRACT_ERRORS[parsed.name]) return CONTRACT_ERRORS[parsed.name];
      if (parsed) return parsed.name;
    } catch {
      /* lanjut ke fallback */
    }
  }
  // ethers kadang menaruh nama error di reason / shortMessage
  const text: string = err?.reason || err?.shortMessage || err?.message || '';
  for (const name of Object.keys(CONTRACT_ERRORS)) {
    if (text.includes(name)) return CONTRACT_ERRORS[name];
  }
  if (text.includes('insufficient funds')) return 'Saldo ETH tidak cukup.';
  return text || 'Transaksi gagal.';
}
