// Validasi URL dari data user sebelum dirender (defense in depth, selain validasi backend).
const POSTER_RE = /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/;

export function safePoster(url?: string | null): string | null {
  return url && POSTER_RE.test(url) ? url : null;
}

export function safeImage(url?: string | null): string | null {
  if (!url) return null;
  if (POSTER_RE.test(url)) return url;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
