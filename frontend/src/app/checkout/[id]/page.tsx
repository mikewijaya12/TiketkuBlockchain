'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getContract, parseContractError, readProvider } from '@/lib/contract';
import { fetchEvent } from '@/lib/events';
import { api } from '@/lib/api';
import { useWallet } from '@/lib/wallet';
import { useToast } from '@/lib/toast';
import { CHAIN_ID, EXPLORER_URL } from '@/lib/config';
import { EventDetail, OnchainEvent } from '@/lib/types';
import { eth, fmtDate, short } from '@/lib/format';
import { Guard } from '@/components/Guard';
import { Poster } from '@/components/Poster';
import { IconCalendar, IconCheck, IconInfo, IconPin, IconShield, IconWallet } from '@/components/Icons';

type TxState = { status: 'waiting' | 'pending' | 'done' | 'failed'; hash?: string; tokenId?: number; error?: string };

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = ['Detail pesanan', 'Pembayaran', 'E-tiket'];
  return (
    <div className="stepper" aria-label="Langkah pemesanan">
      {items.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const cls = n < step ? 'done' : n === step ? 'active' : '';
        return (
          <div key={label} style={{ display: 'contents' }}>
            <div className={`step ${cls}`}>
              <span className="step-num">{n < step ? <IconCheck size={14} /> : n}</span>
              <span className="hidden-mobile">{label}</span>
            </div>
            {n < 3 && <div className="step-line" />}
          </div>
        );
      })}
    </div>
  );
}

function Checkout() {
  const { id: rawId } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const id = Number(rawId);
  const { signer, provider, address } = useWallet();
  const toast = useToast();

  const [ev, setEv] = useState<OnchainEvent | null | undefined>(undefined);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [profile, setProfile] = useState<{ name?: string; email?: string } | null>(null);
  const [held, setHeld] = useState(0);
  const [agree, setAgree] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [txs, setTxs] = useState<TxState[]>([]);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    const p = readProvider();
    fetchEvent(p, id).then(setEv).catch(() => setEv(null));
    api.getEventDetail(id).then(setDetail).catch(() => {});
    api.getProfile().then(setProfile).catch(() => {});
  }, [id]);
  useEffect(() => {
    if (address) getContract(readProvider()).heldCount(id, address).then((n: bigint) => setHeld(Number(n))).catch(() => {});
  }, [address, id]);

  if (ev === undefined) return <div className="container page"><div className="skeleton" style={{ height: 360 }} /></div>;
  if (ev === null) {
    return <div className="container page"><div className="panel empty"><h2>Event tidak ditemukan</h2><Link className="btn btn-primary" href="/explore">Kembali</Link></div></div>;
  }

  const maxQty = Math.max(0, Math.min(Number(ev.maxSupply - ev.sold), Number(ev.maxPerWallet) - held));
  const qty = Math.min(Math.max(1, Number(sp.get('qty')) || 1), Math.max(1, maxQty));
  const total = ev.price * BigInt(qty);
  const closed = ev.cancelled || Number(ev.eventDate) <= Date.now() / 1000;

  const pay = async () => {
    if (!signer || !provider) return toast('Wallet belum terhubung.', 'error');
    if (Number((await provider.getNetwork()).chainId) !== CHAIN_ID) return toast('Jaringan wallet salah.', 'error');
    const c = getContract(signer);
    // Harga selalu dibaca ulang dari kontrak, bukan dari tampilan.
    const price: bigint = (await getContract(readProvider()).events(id)).price;
    setPaying(true);
    const states: TxState[] = Array.from({ length: qty }, () => ({ status: 'waiting' }));
    setTxs([...states]);
    let success = 0;
    for (let i = 0; i < qty; i++) {
      states[i] = { status: 'pending' };
      setTxs([...states]);
      try {
        const tx = await c.buyTicket(id, { value: price });
        states[i] = { status: 'pending', hash: tx.hash };
        setTxs([...states]);
        const rc = await tx.wait();
        let tokenId: number | undefined;
        for (const log of rc?.logs ?? []) {
          try {
            const parsed = c.interface.parseLog(log);
            if (parsed?.name === 'TicketPurchased') tokenId = Number(parsed.args.tokenId);
          } catch { /* log lain */ }
        }
        states[i] = { status: 'done', hash: tx.hash, tokenId };
        success++;
      } catch (e) {
        states[i] = { status: 'failed', error: parseContractError(e) };
        setTxs([...states]);
        for (let j = i + 1; j < qty; j++) states[j] = { status: 'failed', error: 'Dibatalkan karena transaksi sebelumnya gagal' };
        setTxs([...states]);
        break;
      }
      setTxs([...states]);
    }
    setPaying(false);
    if (success > 0) {
      setStep(3);
      toast(`${success} tiket berhasil dibeli!`, 'success');
    }
  };

  const Summary = (
    <div className="panel stack sticky">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Poster id={ev.id} name={ev.name} url={detail?.posterUrl} className="poster" />
      </div>
      <div style={{ fontWeight: 800, fontSize: 17 }}>{ev.name}</div>
      <div className="meta"><IconCalendar size={14} /> {fmtDate(ev.eventDate)}</div>
      <div className="meta"><IconPin size={14} /> {detail?.location || '-'}</div>
      <div>
        <div className="summary-row"><span>Tiket × {qty}</span><span>{eth(total)}</span></div>
        <div className="summary-row"><span>Biaya layanan</span><span style={{ color: 'var(--green-500)', fontWeight: 600 }}>Gratis</span></div>
        <div className="summary-row"><span>Biaya gas</span><span className="muted">Sesuai jaringan</span></div>
        <div className="summary-row summary-total"><span>Total bayar</span><span className="price">{eth(total)}</span></div>
      </div>
    </div>
  );

  return (
    <div className="container page">
      <h1 className="page-title">Pesan tiket</h1>
      <Stepper step={step} />

      {step === 1 && (
        <div className="checkout-grid">
          <div className="stack">
            {(closed || maxQty === 0) && (
              <div className="notice notice-err"><IconInfo /> <span>{closed ? 'Penjualan event ini sudah ditutup.' : 'Kamu sudah mencapai batas tiket per wallet atau tiket habis.'}</span></div>
            )}
            <div className="panel">
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>Data pemesan</h3>
              <div className="form-grid">
                <div className="field"><label>Nama</label><div className="input" style={{ background: 'var(--bg)' }}>{profile?.name || <span className="muted">Belum diisi</span>}</div></div>
                <div className="field"><label>Email</label><div className="input" style={{ background: 'var(--bg)' }}>{profile?.email || <span className="muted">Belum diisi</span>}</div></div>
                <div className="field full"><label>Wallet penerima tiket</label><div className="input mono" style={{ background: 'var(--bg)', wordBreak: 'break-all' }}>{address}</div></div>
              </div>
              <div className="hint">Ubah nama & email di <Link href="/profile" className="link">Profil</Link>. Data ini disimpan off-chain, tiket tetap dikirim ke wallet.</div>
            </div>
            <div className="panel">
              <h3 style={{ fontSize: 16, marginBottom: 10 }}>Sebelum lanjut</h3>
              <ul className="rules" style={{ paddingLeft: 18, margin: '0 0 12px' }}>
                <li>Tiket tidak bisa dipindahkan ke wallet lain kecuali lewat resale resmi.</li>
                <li>Pembelian tidak bisa dibatalkan. Refund hanya jika event dibatalkan penyelenggara.</li>
                <li>Setiap tiket adalah 1 transaksi; kamu akan mengonfirmasi {qty} kali di MetaMask.</li>
              </ul>
              <label className="row" style={{ cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                Saya sudah membaca dan menyetujui aturan tiket
              </label>
            </div>
            <button className="btn btn-accent" style={{ height: 48 }} disabled={!agree || closed || maxQty === 0} onClick={() => setStep(2)}>
              Lanjut ke pembayaran
            </button>
          </div>
          <aside>{Summary}</aside>
        </div>
      )}

      {step === 2 && (
        <div className="checkout-grid">
          <div className="stack">
            <div className="panel stack">
              <h3 style={{ fontSize: 16 }}>Metode pembayaran</h3>
              <label className="row card" style={{ padding: 14, borderColor: 'var(--blue-500)', boxShadow: '0 0 0 3px var(--blue-100)' }}>
                <input type="radio" checked readOnly />
                <span className="info-icon"><IconWallet /></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>ETH via MetaMask</div>
                  <div className="hint mono">{short(address ?? '')}</div>
                </div>
              </label>
              <div className="notice notice-info"><IconShield /> <span>Dana kamu ditahan smart contract (escrow) sampai 1 hari setelah acara. Jika event dibatalkan, kamu bisa refund penuh.</span></div>
              {txs.length > 0 && (
                <div className="tx-list" aria-live="polite">
                  {txs.map((t, i) => (
                    <div key={i} className="tx-item">
                      <span>Tiket {i + 1}{t.tokenId ? ` · #${t.tokenId}` : ''}</span>
                      <span>
                        {t.status === 'waiting' && <span className="badge badge-gray">Menunggu</span>}
                        {t.status === 'pending' && <span className="badge badge-amber">{t.hash ? 'Dikonfirmasi jaringan…' : 'Konfirmasi di wallet…'}</span>}
                        {t.status === 'done' && <span className="badge badge-green">Berhasil</span>}
                        {t.status === 'failed' && <span className="badge badge-red" title={t.error}>{t.error}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="row">
                <button className="btn btn-ghost" disabled={paying} onClick={() => { setStep(1); setTxs([]); }}>Kembali</button>
                <button className="btn btn-accent" style={{ flex: 1, height: 48 }} disabled={paying} onClick={pay}>
                  {paying ? 'Memproses pembayaran…' : `Bayar ${eth(total)}`}
                </button>
              </div>
            </div>
          </div>
          <aside>{Summary}</aside>
        </div>
      )}

      {step === 3 && (
        <div className="panel" style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <div className="success-mark"><IconCheck size={36} /></div>
          <h2 style={{ fontSize: 22 }}>Pembayaran berhasil!</h2>
          <p className="muted">E-tiket sudah masuk ke wallet kamu dan bisa dilihat di Tiket Saya.</p>
          <div className="tx-list" style={{ textAlign: 'left', margin: '16px 0' }}>
            {txs.filter((t) => t.status === 'done').map((t) => (
              <div key={t.hash} className="tx-item">
                <span>Tiket #{t.tokenId ?? '-'}</span>
                {EXPLORER_URL && t.hash ? (
                  <a className="link mono" href={`${EXPLORER_URL}/tx/${t.hash}`} target="_blank" rel="noopener noreferrer">{short(t.hash)}</a>
                ) : <span className="mono muted">{short(t.hash)}</span>}
              </div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link href="/orders" className="btn btn-primary">Lihat e-tiket</Link>
            <Link href="/explore" className="btn btn-outline">Cari event lain</Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Guard>
      <Suspense fallback={<div className="container page"><div className="skeleton" style={{ height: 360 }} /></div>}>
        <Checkout />
      </Suspense>
    </Guard>
  );
}
