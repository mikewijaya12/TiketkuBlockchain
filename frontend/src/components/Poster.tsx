import { safePoster } from '@/lib/safe';

const PALETTE = [
  ['#0d6efd', '#5aa2ff'], ['#7c3aed', '#c084fc'], ['#db2777', '#f472b6'],
  ['#0891b2', '#67e8f9'], ['#ea580c', '#fdba74'], ['#16a34a', '#86efac'],
];

// Poster event; kalau belum ada, tampilkan sampul gradien dengan inisial.
export function Poster({
  id, name, url, children, className = 'poster',
}: { id: number; name: string; url?: string | null; children?: React.ReactNode; className?: string }) {
  const src = safePoster(url);
  const [a, b] = PALETTE[id % PALETTE.length];
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  return (
    <div className={className}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Poster ${name}`} loading="lazy" />
      ) : (
        <div className="poster-fallback" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>{initials || 'TK'}</div>
      )}
      {children}
    </div>
  );
}
