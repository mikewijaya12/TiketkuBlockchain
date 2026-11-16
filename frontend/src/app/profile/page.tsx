'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useWallet } from '@/lib/wallet';
import { useToast } from '@/lib/toast';
import { safeImage } from '@/lib/safe';
import { short } from '@/lib/format';
import { Guard } from '@/components/Guard';
import { Modal } from '@/components/Modal';
import { IconShield } from '@/components/Icons';

type App = Awaited<ReturnType<typeof api.myApplication>>;

function Profile() {
  const { address, roles, logout } = useWallet();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', avatarUrl: '' });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [app, setApp] = useState<App>(null);
  const [eo, setEo] = useState({ organizationName: '', contactEmail: '', description: '' });
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    api.getProfile().then((p) => {
      setForm({ name: p?.name ?? '', email: p?.email ?? '', avatarUrl: p?.avatarUrl ?? '' });
      setLoaded(true);
    }).catch(() => setLoaded(true));
    api.myApplication().then((a) => {
      setApp(a);
      if (a) setEo({ organizationName: a.organizationName, contactEmail: a.contactEmail, description: a.description ?? '' });
    }).catch(() => {});
  }, []);

  const avatarOk = !form.avatarUrl || safeImage(form.avatarUrl);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!avatarOk) return;
    setSaving(true);
    try {
      await api.updateProfile({
        name: form.name.trim(),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.avatarUrl.trim() ? { avatarUrl: form.avatarUrl.trim() } : {}),
      });
      toast('Profil disimpan.', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    setApplying(true);
    try {
      await api.applyOrganizer({
        organizationName: eo.organizationName.trim(),
        contactEmail: eo.contactEmail.trim(),
        ...(eo.description.trim() ? { description: eo.description.trim() } : {}),
      });
      setApp(await api.myApplication());
      toast('Pengajuan terkirim. Admin akan meninjau.', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setApplying(false);
    }
  };

  const STATUS: Record<string, [string, string]> = {
    pending: ['badge-amber', 'Menunggu review'],
    approved: ['badge-green', 'Disetujui, menunggu role diaktifkan Admin'],
    rejected: ['badge-red', 'Ditolak'],
  };

  return (
    <div className="container page" style={{ maxWidth: 760 }}>
      <h1 className="page-title">Profil & Akun</h1>
      <p className="muted" style={{ margin: '0 0 18px' }}>Data profil disimpan off-chain di server TiketKu. Identitas utama kamu tetap alamat wallet.</p>

      <div className="stack">
        <form className="panel" onSubmit={save}>
          <div className="row" style={{ marginBottom: 16 }}>
            <span className="avatar" style={{ width: 56, height: 56, fontSize: 22 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {safeImage(form.avatarUrl) ? <img src={safeImage(form.avatarUrl)!} alt="" referrerPolicy="no-referrer" /> : (form.name || 'U').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <div style={{ fontWeight: 700 }}>{form.name || 'Pengguna TiketKu'}</div>
              <div className="mono muted" style={{ fontSize: 13 }}>{address}</div>
              <div className="role-tags">
                <span className="badge badge-gray">Buyer</span>
                {roles?.organizer && <span className="badge badge-blue">Organizer</span>}
                {roles?.gate && <span className="badge badge-green">Gate</span>}
                {roles?.admin && <span className="badge badge-accent">Admin</span>}
              </div>
            </div>
          </div>
          {!loaded ? <div className="skeleton" style={{ height: 160 }} /> : (
            <div className="form-grid">
              <div className="field">
                <label htmlFor="name">Nama lengkap</label>
                <input id="name" className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" className="input" maxLength={120} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field full">
                <label htmlFor="av">URL foto profil (opsional)</label>
                <input id="av" className="input" placeholder="https://…" maxLength={300} value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} />
                {!avatarOk && <div className="err-text">Hanya URL https:// yang diizinkan.</div>}
              </div>
            </div>
          )}
          <div className="row between wrap">
            <button type="button" className="btn btn-ghost" style={{ color: 'var(--red-500)' }} onClick={() => setConfirmDel(true)}>Hapus data profil</button>
            <button className="btn btn-primary" disabled={saving || !avatarOk || !form.name.trim()}>{saving ? 'Menyimpan…' : 'Simpan profil'}</button>
          </div>
        </form>

        <div className="panel" id="eo">
          <div className="row between wrap" style={{ marginBottom: 6 }}>
            <h2 style={{ fontSize: 18 }}>Jadi Event Organizer</h2>
            {app && <span className={`badge ${STATUS[app.status][0]}`}>{STATUS[app.status][1]}</span>}
          </div>
          {roles?.organizer ? (
            <div className="notice notice-ok"><IconShield /> <span>Wallet ini sudah memiliki role Event Organizer. Buka Dashboard EO untuk membuat event.</span></div>
          ) : (
            <form onSubmit={apply}>
              <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>Ajukan diri untuk menjual tiket event kamu. Setelah disetujui, Admin memberikan role Organizer langsung di smart contract.</p>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="org">Nama organisasi</label>
                  <input id="org" className="input" required minLength={2} maxLength={100} disabled={app?.status === 'approved'} value={eo.organizationName} onChange={(e) => setEo({ ...eo, organizationName: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="ce">Email kontak</label>
                  <input id="ce" type="email" className="input" required maxLength={120} disabled={app?.status === 'approved'} value={eo.contactEmail} onChange={(e) => setEo({ ...eo, contactEmail: e.target.value })} />
                </div>
                <div className="field full">
                  <label htmlFor="desc">Deskripsi singkat</label>
                  <textarea id="desc" className="textarea" maxLength={1000} disabled={app?.status === 'approved'} value={eo.description} onChange={(e) => setEo({ ...eo, description: e.target.value })} />
                </div>
              </div>
              {app?.status !== 'approved' && (
                <button className="btn btn-primary" disabled={applying}>{applying ? 'Mengirim…' : app ? 'Perbarui pengajuan' : 'Kirim pengajuan'}</button>
              )}
            </form>
          )}
        </div>
      </div>

      {confirmDel && (
        <Modal title="Hapus data profil?" onClose={() => setConfirmDel(false)}>
          <p style={{ marginTop: 0 }}>Nama, email, dan foto profil akan dihapus dari server. Tiket NFT di wallet <b className="mono">{short(address ?? '')}</b> <b>tidak</b> ikut terhapus.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setConfirmDel(false)}>Batal</button>
            <button className="btn btn-danger" onClick={async () => {
              try {
                await api.deleteProfile();
                toast('Data profil dihapus.', 'success');
                logout();
              } catch (err: any) {
                toast(err.message, 'error');
              }
            }}>Ya, hapus</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return <Guard><Profile /></Guard>;
}
