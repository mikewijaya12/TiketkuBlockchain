import { API_URL } from './config';

// Token disimpan di memori + sessionStorage (sesuai docs: JANGAN localStorage).
let token: string | null =
  typeof window !== 'undefined' ? sessionStorage.getItem('tk_token') : null;

export function setToken(t: string | null) {
  token = t;
  if (typeof window === 'undefined') return;
  if (t) sessionStorage.setItem('tk_token', t);
  else sessionStorage.removeItem('tk_token');
}

export function getToken() {
  return token;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, data?.error || `Gagal (${res.status})`);
  }
  return data as T;
}

// ---------- Auth ----------
export const api = {
  nonce: (address: string) =>
    request<{ nonce: string; message: string }>(
      `/auth/nonce?address=${address}`
    ),

  verify: (address: string, nonce: string, signature: string) =>
    request<{ token: string; address: string }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ address, nonce, signature }),
    }),

  me: () =>
    request<{
      address: string;
      roles: { admin: boolean; organizer: boolean; gate: boolean; buyer: boolean };
    }>('/auth/me'),

  // ---------- Profil (off-chain) ----------
  getProfile: () =>
    request<{ address: string; name?: string; email?: string; avatarUrl?: string }>(
      '/users/me'
    ).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }),

  updateProfile: (data: { name: string; email?: string; avatarUrl?: string }) =>
    request('/users/me', { method: 'PUT', body: JSON.stringify(data) }),

  deleteProfile: () => request('/users/me', { method: 'DELETE' }),

  // ---------- Detail event (off-chain) ----------
  getEventDetail: (id: number) =>
    request<{ description: string; location: string; posterUrl?: string }>(
      `/events/${id}/details`
    ).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }),

  putEventDetail: (
    id: number,
    data: { description: string; location: string; posterUrl?: string }
  ) =>
    request(`/events/${id}/details`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteEventDetail: (id: number) =>
    request(`/events/${id}/details`, { method: 'DELETE' }),

  // ---------- Poster ----------
  uploadPoster: (file: File) => {
    const fd = new FormData();
    fd.append('poster', file);
    return request<{ url: string }>('/upload/poster', { method: 'POST', body: fd });
  },

  // ---------- Pengajuan EO ----------
  applyOrganizer: (data: {
    organizationName: string;
    description?: string;
    contactEmail: string;
  }) => request('/organizer/apply', { method: 'POST', body: JSON.stringify(data) }),

  myApplication: () =>
    request<{ organizationName: string; description?: string; contactEmail: string; status: 'pending' | 'approved' | 'rejected'; createdAt: string }>(
      '/organizer/me'
    ).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }),

  listApplications: (status?: 'pending' | 'approved' | 'rejected') =>
    request<
      Array<{
        address: string;
        organizationName: string;
        description?: string;
        contactEmail: string;
        status: string;
        createdAt: string;
      }>
    >(`/organizer/applications${status ? `?status=${status}` : ''}`),

  reviewApplication: (address: string, status: 'approved' | 'rejected') =>
    request(`/organizer/applications/${address}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};
