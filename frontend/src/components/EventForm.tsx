'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatEther, parseEther } from 'ethers';
import { api } from '@/lib/api';
import { getContract, parseContractError } from '@/lib/contract';
import { useWallet } from '@/lib/wallet';
import { useToast } from '@/lib/toast';
import { CHAIN_ID } from '@/lib/config';
import { EventDetail, OnchainEvent } from '@/lib/types';
import { eth } from '@/lib/format';
import { Poster } from './Poster';
import { IconInfo, IconLock } from './Icons';

const toLocalInput = (unix: number) => {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Form buat / edit event. Data on-chain (harga, kuota, tanggal) dan off-chain (lokasi, deskripsi, poster).
export function EventForm({ ev, detail }: { ev?: OnchainEvent; detail?: EventDetail | null }) {
  const router = useRouter();
  const { signer, provider } = useWallet();
  const toast = useToast();
  const locked = !!ev && ev.sold > 0n; // kontrak menolak update on-chain setelah ada penjualan

  const [f, setF] = useState({
    name: ev?.name ?? '',
    price: ev ? formatEther(ev.price) : '0.01',
    maxSupply: ev ? ev.maxSupply.toString() : '100',
    resalePct: ev ? String(ev.maxResaleBps / 100) : '110',
    date: ev ? toLocalInput(Number(ev.eventDate)) : toLocalInput(Math.floor(Date.now() / 1000) + 7 * 86400),
    perWallet: ev ? ev.maxPerWallet.toString() : '4',
    location: detail?.location ?? '',
    description: detail?.description ?? '',
    posterUrl: detail?.posterUrl ?? '',
  });
  const [busy, setBusy] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (detail) setF((cur) => ({ ...cur, location: detail.location, description: detail.description, posterUrl: detail.posterUrl ?? '' }));
  }, [detail]);

  // Validasi sisi klien (cerminan aturan kontrak, supaya user tidak buang gas).
  const errors: Partial<Record<keyof typeof f, string>> = {};
  if (!f.name.trim()) errors.name = 'Wajib diisi';
  else if (new TextEncoder().encode(f.name.trim()).length > 100) errors.name = 'Maksimal 100 byte';
  let priceWei = 0n;
  try { priceWei = parseEther(f.price || '0'); if (priceWei <= 0n) errors.price = 'Harus lebih dari 0'; } catch { errors.price = 'Format tidak valid'; }
  const supply = Number(f.maxSupply);
  if (!Number.isInteger(supply) || supply < 1 || supply > 100000) errors.maxSupply = '1 - 100.000';
  const pct = Number(f.resalePct);
  if (!(pct >= 100 && pct <= 110)) errors.resalePct = '100 - 110%';
  const per = Number(f.perWallet);
  if (!Number.isInteger(per) || per < 1 || per > 10) errors.perWallet = '1 - 10';
  const unix = Math.floor(new Date(f.date).getTime() / 1000);
  if (!unix || unix <= Date.now() / 1000 + 60) errors.date = 'Harus di masa depan';
  if (f.location.length > 200) errors.location = 'Maksimal 200 karakter';
  if (f.description.length > 5000) errors.description = 'Maksimal 5000 karakter';
  const onchainInvalid = !locked && ['name', 'price', 'maxSupply', 'resalePct', 'perWallet', 'date'].some((k) => errors[k as keyof typeof f]);
  const offInvalid = !!(errors.location || errors.description);

  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('Ukuran poster maksimal 2 MB.', 'error');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast('Hanya JPG, PNG, atau WEBP.', 'error');
    setBusy('upload');
    try {
      const { url } = await api.uploadPoster(file);
      setF((cur) => ({ ...cur, posterUrl: url }));
      toast('Poster diunggah.', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signer || !provider) return toast('Wallet belum terhubung.', 'error');
    if (Number((await provider.getNetwork()).chainId) !== CHAIN_ID) return toast('Jaringan wallet salah.', 'error');
    const c = getContract(signer);
    let id = ev?.id;
    try {
      if (!locked) {
        setBusy('chain');
        const args = [f.name.trim(), priceWei, BigInt(supply), Math.round(pct * 100), BigInt(unix), BigInt(per)] as const;
        const tx = ev ? await c.updateEvent(ev.id, ...args) : await c.createEvent(...args);
        toast('Transaksi dikirim, menunggu konfirmasi…');
        const rc = await tx.wait();
        if (!ev) {
          for (const log of rc?.logs ?? []) {
            try {
              const p = c.interface.parseLog(log);
              if (p?.name === 'EventCreated') id = Number(p.args.eventId);
            } catch { /* abaikan */ }
          }
        }
      }
      if (id) {
        setBusy('detail');
        await api.putEventDetail(id, {
          description: f.description,
          location: f.location.trim(),
          ...(f.posterUrl ? { posterUrl: f.posterUrl } : {}),
        });
      }
      toast(ev ? 'Event diperbarui.' : 'Event berhasil dibuat!', 'success');
      router.push('/organizer');
    } catch (err: any) {
      toast(err?.status ? err.message : parseContractError(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const Err = ({ k }: { k: keyof typeof f }) => (errors[k] ? <div className="err-text">{errors[k]}</div> : null);

  return (
    <form onSubmit={submit} className="stack">
      <div className="panel">
        <div className="row between" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 16 }}>Data tiket (on-chain)</h3>
          {locked && <span className="badge badge-gray"><IconLock size={12} /> Terkunci</span>}
        </div>
        {locked && <div className="notice notice-warn" style={{ marginBottom: 12 }}><IconInfo /> <span>Sudah ada tiket terjual, jadi harga, kuota, dan tanggal tidak bisa diubah (melindungi pembeli). Deskripsi, lokasi, dan poster tetap bisa diubah.</span></div>}
        <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0 }}>
          <div className="form-grid">
            <div className="field full"><label htmlFor="n">Nama event</label><input id="n" className="input" value={f.name} onChange={set('name')} placeholder="Contoh: Konser Akustik Malam Minggu" /><Err k="name" /></div>
            <div className="field"><label htmlFor="p">Harga tiket (ETH)</label><input id="p" className="input" inputMode="decimal" value={f.price} onChange={set('price')} /><Err k="price" /></div>
            <div className="field"><label htmlFor="s">Jumlah tiket</label><input id="s" className="input" type="number" min={1} value={f.maxSupply} onChange={set('maxSupply')} /><Err k="maxSupply" /></div>
            <div className="field"><label htmlFor="d">Tanggal & jam acara</label><input id="d" className="input" type="datetime-local" value={f.date} onChange={set('date')} /><Err k="date" /></div>
            <div className="field"><label htmlFor="w">Maks. tiket per wallet</label><input id="w" className="input" type="number" min={1} max={10} value={f.perWallet} onChange={set('perWallet')} /><Err k="perWallet" /></div>
            <div className="field full">
              <label htmlFor="r">Batas harga resale: {f.resalePct}% {!errors.price && !errors.resalePct && <span className="muted">(maks. {eth((priceWei * BigInt(Math.round(pct * 100))) / 10000n)})</span>}</label>
              <input id="r" type="range" min={100} max={110} step={1} value={f.resalePct} onChange={set('resalePct')} />
              <Err k="resalePct" />
            </div>
          </div>
        </fieldset>
      </div>

      <div className="panel">
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Info event (off-chain)</h3>
        <div className="field"><label htmlFor="l">Lokasi</label><input id="l" className="input" value={f.location} onChange={set('location')} placeholder="Contoh: Istora Senayan, Jakarta" maxLength={200} /><Err k="location" /></div>
        <div className="field"><label htmlFor="desc">Deskripsi</label><textarea id="desc" className="textarea" rows={6} value={f.description} onChange={set('description')} maxLength={5000} /><div className="hint">{f.description.length}/5000</div></div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Poster</label>
          <div className="upload-box">
            <Poster id={ev?.id ?? 0} name={f.name || 'Event'} url={f.posterUrl} />
            <div className="stack" style={{ gap: 6 }}>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => upload(e.target.files?.[0])} disabled={busy === 'upload'} />
              <div className="hint">JPG, PNG, atau WEBP, maks. 2 MB. Rasio 16:10 disarankan.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={() => router.push('/organizer')}>Batal</button>
        <button className="btn btn-primary" disabled={!!busy || onchainInvalid || offInvalid}>
          {busy === 'chain' ? 'Menunggu transaksi…' : busy === 'detail' ? 'Menyimpan detail…' : ev ? 'Simpan perubahan' : 'Buat event'}
        </button>
      </div>
    </form>
  );
}
