import Link from 'next/link';
import { CONTRACT_ADDRESS, EXPLORER_URL } from '@/lib/config';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <h4>TiketKu</h4>
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              Platform tiket event berbasis blockchain. Setiap tiket adalah NFT yang tidak bisa dipalsukan,
              tidak bisa dicaloin, dan hanya bisa dijual ulang dengan harga wajar.
            </p>
          </div>
          <div>
            <h4>Jelajahi</h4>
            <Link href="/explore">Semua event</Link>
            <Link href="/orders">Tiket saya</Link>
            <Link href="/profile#eo">Jadi Event Organizer</Link>
          </div>
          <div>
            <h4>Transparansi</h4>
            {EXPLORER_URL ? (
              <a href={`${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer">Smart contract di Etherscan</a>
            ) : (
              <span className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{CONTRACT_ADDRESS}</span>
            )}
            <Link href="/help">Cara kerja & aturan</Link>
          </div>
        </div>
        <div className="footer-bottom">© 2026 TiketKu · Mini project COMP6873001 Blockchain Fundamental, BINUS University</div>
      </div>
    </footer>
  );
}
