'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { BrowserProvider, JsonRpcSigner } from 'ethers';
import { api, setToken, getToken } from './api';
import { CHAIN_ID, CHAINS } from './config';
import { Roles } from './types';

interface WalletState {
  address: string | null;
  signer: JsonRpcSigner | null;
  provider: BrowserProvider | null;
  roles: Roles | null;
  chainOk: boolean;
  connecting: boolean;
  authed: boolean;
  /** true setelah percobaan memulihkan sesi selesai */
  ready: boolean;
  hasWallet: boolean;
  connect: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => void;
  switchChain: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<WalletState | null>(null);

function getEth(): any {
  return typeof window !== 'undefined' ? (window as any).ethereum : undefined;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [roles, setRoles] = useState<Roles | null>(null);
  const [chainOk, setChainOk] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);
  const loggingIn = useRef(false);

  const buildProvider = useCallback(async () => {
    const eth = getEth();
    if (!eth) throw new Error('MetaMask tidak terpasang. Install dulu dari metamask.io');
    const prov = new BrowserProvider(eth);
    const net = await prov.getNetwork();
    const sign = await prov.getSigner();
    const addr = await sign.getAddress();
    setProvider(prov);
    setSigner(sign);
    setAddress(addr.toLowerCase());
    setChainOk(Number(net.chainId) === CHAIN_ID);
    return { prov, sign, addr: addr.toLowerCase() };
  }, []);

  const refreshRoles = useCallback(async () => {
    if (!getToken()) return;
    try {
      const me = await api.me();
      setRoles(me.roles);
    } catch {
      setRoles(null);
    }
  }, []);

  const connect = useCallback(async () => {
    const eth = getEth();
    if (!eth) throw new Error('MetaMask tidak terpasang. Install dulu dari metamask.io');
    setConnecting(true);
    try {
      await eth.request({ method: 'eth_requestAccounts' });
      await buildProvider();
    } finally {
      setConnecting(false);
    }
  }, [buildProvider]);

  // Login SIWE: nonce -> sign -> verify -> JWT -> role.
  const login = useCallback(async () => {
    if (loggingIn.current) return;
    loggingIn.current = true;
    try {
      const { sign, addr } = provider && signer && address
        ? { sign: signer, addr: address }
        : await buildProvider();
      const { nonce, message } = await api.nonce(addr);
      const signature = await sign.signMessage(message);
      const { token } = await api.verify(addr, nonce, signature);
      setToken(token);
      setAuthed(true);
      await refreshRoles();
    } finally {
      loggingIn.current = false;
    }
  }, [provider, signer, address, buildProvider, refreshRoles]);

  const logout = useCallback(() => {
    setToken(null);
    setAuthed(false);
    setRoles(null);
  }, []);

  const switchChain = useCallback(async () => {
    const eth = getEth();
    if (!eth) return;
    const target = CHAINS[CHAIN_ID];
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: target.chainId }],
      });
    } catch (e: any) {
      if (e?.code === 4902) {
        await eth.request({ method: 'wallet_addEthereumChain', params: [target] });
      } else {
        throw e;
      }
    }
    await buildProvider();
  }, [buildProvider]);

  // Pulihkan sesi: kalau wallet sudah connect & token masih ada.
  useEffect(() => {
    const eth = getEth();
    setHasWallet(!!eth);
    if (!eth) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        const accts: string[] = await eth.request({ method: 'eth_accounts' });
        if (accts.length > 0) {
          const { addr } = await buildProvider();
          if (getToken()) {
            // Token di sessionStorage harus milik akun yang sedang aktif di wallet.
            const me = await api.me().catch(() => null);
            if (me && me.address.toLowerCase() === addr) {
              setAuthed(true);
              setRoles(me.roles);
            } else {
              setToken(null);
            }
          }
        }
        setReady(true);
      } catch {
        /* abaikan */
      } finally {
        setReady(true);
      }
    })();

    const onAccounts = (accts: string[]) => {
      // Ganti akun = sesi lama tidak berlaku.
      logout();
      if (accts.length === 0) {
        setAddress(null);
        setSigner(null);
      } else {
        buildProvider().catch(() => {});
      }
    };
    const onChain = () => window.location.reload();
    eth.on?.('accountsChanged', onAccounts);
    eth.on?.('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts);
      eth.removeListener?.('chainChanged', onChain);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Ctx.Provider
      value={{
        address,
        signer,
        provider,
        roles,
        chainOk,
        connecting,
        authed,
        ready,
        hasWallet,
        connect,
        login,
        logout,
        switchChain,
        refreshRoles,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWallet harus di dalam WalletProvider');
  return ctx;
}
