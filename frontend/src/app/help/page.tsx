import Link from 'next/link';

export const metadata = { title: 'Cara kerja & aturan' };

const FAQ: [string, string][] = [
  ['Apa itu tiket NFT?', 'Tiket TiketKu dicetak sebagai token ERC-721 di blockchain Ethereum. Kepemilikannya tercatat publik, jadi tidak bisa dipalsukan atau digandakan.'],
  ['Kenapa tiket tidak bisa dikirim ke wallet lain?', 'Untuk mencegah calo. Smart contract memblokir transfer bebas; tiket hanya bisa berpindah lewat fitur resale resmi dengan harga maksimal 110% dari harga asli.'],
  ['Berapa tiket yang boleh saya beli?', 'Setiap event punya batas tiket per wallet (1 sampai 10) yang ditentukan penyelenggara. Batas ini juga berlaku untuk tiket dari resale.'],
  ['Bagaimana jika event dibatalkan?', 'Dana pembelian dan resale ditahan smart contract (escrow) sampai 1 hari setelah acara. Event hanya bisa dibatalkan sampai 6 jam sebelum acara. Jika dibatalkan, buka Tiket Saya lalu cairkan refund: pembeli pertama mendapat harga asli, pembeli resale mendapat kembali harga resale yang dibayar.'],
  ['Kapan hasil jual ulang bisa ditarik?', 'Hasil resale ditahan sampai 1 hari setelah acara selesai, lalu bisa dicairkan dari Tiket Saya. Ini mencegah penjual untung dari tiket event yang ternyata dibatalkan.'],
  ['Bagaimana cara masuk ke venue?', 'Di Tiket Saya, tekan Tampilkan e-tiket. Wallet kamu menandatangani QR yang berlaku 5 menit (tanpa biaya gas). Petugas gate memindai QR dan smart contract memverifikasi tanda tangan kamu.'],
  ['Apakah screenshot QR bisa dipakai orang lain?', 'QR kedaluwarsa dalam 5 menit dan tiket hanya bisa check-in sekali. QR juga tidak berlaku lagi jika tiket sudah dijual ulang ke orang lain.'],
  ['Bagaimana menjadi Event Organizer?', 'Masuk, buka Profil, lalu isi formulir Jadi Event Organizer. Setelah disetujui, Admin memberikan role Organizer di smart contract.'],
];

export default function Help() {
  return (
    <div className="container page" style={{ maxWidth: 780 }}>
      <h1 className="page-title">Cara kerja & aturan</h1>
      <p className="muted" style={{ margin: '0 0 18px' }}>Semua aturan di bawah ini ditegakkan langsung oleh smart contract, bukan hanya oleh aplikasi.</p>
      <div className="stack">
        {FAQ.map(([q, a]) => (
          <details key={q} className="panel">
            <summary style={{ fontWeight: 700, cursor: 'pointer' }}>{q}</summary>
            <p className="muted" style={{ marginBottom: 0, lineHeight: 1.6 }}>{a}</p>
          </details>
        ))}
      </div>
      <div style={{ marginTop: 20 }}><Link href="/explore" className="btn btn-primary">Mulai cari event</Link></div>
    </div>
  );
}
