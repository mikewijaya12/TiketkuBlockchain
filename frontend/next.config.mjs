/** @type {import('next').NextConfig} */
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '31337');
const RPC =
  process.env.NEXT_PUBLIC_RPC_URL ||
  (CHAIN_ID === 31337 ? 'http://127.0.0.1:8545' : 'https://ethereum-sepolia-rpc.publicnode.com');
const dev = process.env.NODE_ENV !== 'production';

// Content Security Policy: hanya boleh memuat script dari origin sendiri dan
// menghubungi backend + RPC yang dikonfigurasi. Membatasi dampak XSS.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  `connect-src 'self' ${API} ${RPC}${dev ? ' ws: wss:' : ''}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Teruskan permintaan /uploads/* ke backend supaya poster tampil tanpa CORS.
  async rewrites() {
    return [{ source: '/uploads/:path*', destination: `${API}/uploads/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
