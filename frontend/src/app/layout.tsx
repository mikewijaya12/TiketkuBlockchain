import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: { default: 'TiketKu - Tiket Event Anti Calo', template: '%s | TiketKu' },
  description: 'Beli tiket konser dan event sebagai NFT. Anti palsu, anti calo, resale dengan harga wajar.',
};

export const viewport: Viewport = { themeColor: '#0d6efd', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <Providers>
          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
