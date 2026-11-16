export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  '0x0000000000000000000000000000000000000000';

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '31337');

// RPC publik untuk MEMBACA data kontrak tanpa wallet (halaman publik).
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  (CHAIN_ID === 31337 ? 'http://127.0.0.1:8545' : 'https://ethereum-sepolia-rpc.publicnode.com');

export const EXPLORER_URL = CHAIN_ID === 11155111 ? 'https://sepolia.etherscan.io' : '';

// Metadata jaringan untuk wallet_addEthereumChain bila user belum punya chain-nya.
export const CHAINS: Record<number, {
  chainId: string;
  chainName: string;
  rpcUrls: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
  blockExplorerUrls?: string[];
}> = {
  31337: {
    chainId: '0x7a69',
    chainName: 'Hardhat Local',
    rpcUrls: ['http://127.0.0.1:8545'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  11155111: {
    chainId: '0xaa36a7',
    chainName: 'Sepolia',
    rpcUrls: ['https://rpc.sepolia.org'],
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  },
};
