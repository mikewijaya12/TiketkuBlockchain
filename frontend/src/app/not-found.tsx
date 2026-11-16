import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container page">
      <div className="panel empty" style={{ maxWidth: 480, margin: '40px auto' }}>
        <h1 style={{ fontSize: 40 }}>404</h1>
        <p className="muted">Halaman tidak ditemukan.</p>
        <Link href="/" className="btn btn-primary">Ke beranda</Link>
      </div>
    </div>
  );
}
