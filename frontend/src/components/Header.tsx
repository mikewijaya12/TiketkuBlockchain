'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@/lib/wallet';
import { api } from '@/lib/api';
import { short } from '@/lib/format';
import { safeImage } from '@/lib/safe';
import { CHAINS, CHAIN_ID } from '@/lib/config';
import { LoginButton } from './LoginButton';
import { IconGrid, IconHome, IconLogout, IconScan, IconSearch, IconShield, IconTicket, IconUser, IconChart } from './Icons';

export function Header() {
  const path = usePathname();
  const { address, authed, roles, chainOk, ready, logout, switchChain } = useWallet();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<{ name?: string; avatarUrl?: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authed) api.getProfile().then(setProfile).catch(() => setProfile(null));
    else setProfile(null);
  }, [authed, address]);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => setOpen(false), [path]);

  const is = (p: string) => (p === '/' ? path === '/' : path.startsWith(p));
  const links = [
    { href: '/', label: 'Beranda', show: true },
    { href: '/explore', label: 'Jelajah Event', show: true },
    { href: '/orders', label: 'Tiket Saya', show: authed },
    { href: '/organizer', label: 'Dashboard EO', show: !!roles?.organizer },
    { href: '/gate', label: 'Gate', show: !!roles?.gate },
    { href: '/admin', label: 'Admin', show: !!roles?.admin },
  ];
  const avatar = safeImage(profile?.avatarUrl);
  const display = profile?.name || short(address ?? '');

  return (
    <>
      {ready && authed && !chainOk && (
        <div className="banner banner-warn">
          <div className="container">
            <span>Wallet terhubung ke jaringan yang salah. TiketKu memakai <b>{CHAINS[CHAIN_ID]?.chainName}</b>.</span>
            <button className="btn btn-sm btn-accent" onClick={() => switchChain().catch(() => {})}>Ganti jaringan</button>
          </div>
        </div>
      )}
      <header className="header">
        <div className="container header-inner">
          <Link href="/" className="logo" aria-label="TiketKu beranda">
            <span className="logo-mark"><IconTicket size={17} /></span>
            <span>Tiket<span className="ku">Ku</span></span>
          </Link>
          <nav className="nav" aria-label="Navigasi utama">
            {links.filter((l) => l.show).map((l) => (
              <Link key={l.href} href={l.href} className={is(l.href) ? 'active' : ''}>{l.label}</Link>
            ))}
          </nav>
          <div className="header-right">
            <span className="chain-pill">{CHAINS[CHAIN_ID]?.chainName}</span>
            {!ready ? (
              <div className="skeleton" style={{ width: 120, height: 36 }} />
            ) : authed && address ? (
              <div className="account" ref={ref}>
                <button className="account-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                  <span className="avatar">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : display.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden-mobile" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{display}</span>
                </button>
                {open && (
                  <div className="menu" role="menu">
                    <div className="menu-head">
                      <div style={{ fontWeight: 700 }}>{profile?.name || 'Pengguna TiketKu'}</div>
                      <div className="mono muted" style={{ fontSize: 12 }}>{short(address)}</div>
                      <div className="role-tags">
                        <span className="badge badge-gray">Buyer</span>
                        {roles?.organizer && <span className="badge badge-blue">Organizer</span>}
                        {roles?.gate && <span className="badge badge-green">Gate</span>}
                        {roles?.admin && <span className="badge badge-accent">Admin</span>}
                      </div>
                    </div>
                    <hr />
                    <Link href="/orders"><IconTicket /> Tiket Saya</Link>
                    <Link href="/profile"><IconUser /> Profil & Akun</Link>
                    {roles?.organizer && <Link href="/organizer"><IconChart /> Dashboard EO</Link>}
                    {roles?.gate && <Link href="/gate"><IconScan /> Scan Tiket</Link>}
                    {roles?.admin && <Link href="/admin"><IconShield /> Panel Admin</Link>}
                    <hr />
                    <button onClick={logout}><IconLogout /> Keluar</button>
                  </div>
                )}
              </div>
            ) : (
              <LoginButton className="btn btn-primary btn-sm" label="Masuk" />
            )}
          </div>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Navigasi bawah">
        <Link href="/" className={is('/') ? 'active' : ''}><IconHome /> Beranda</Link>
        <Link href="/explore" className={is('/explore') ? 'active' : ''}><IconSearch /> Jelajah</Link>
        <Link href="/orders" className={is('/orders') ? 'active' : ''}><IconTicket /> Tiket</Link>
        {roles?.organizer || roles?.admin || roles?.gate ? (
          <Link href={roles.admin ? '/admin' : roles.organizer ? '/organizer' : '/gate'} className={is('/admin') || is('/organizer') || is('/gate') ? 'active' : ''}><IconGrid /> Kelola</Link>
        ) : null}
        <Link href="/profile" className={is('/profile') ? 'active' : ''}><IconUser /> Akun</Link>
      </nav>
    </>
  );
}
