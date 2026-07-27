const TOKEN_KEY = 'campusmate_session';
const API_ORIGIN = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export const session = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${API_ORIGIN}/api${apiPath}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(session.get() ? { Authorization: `Bearer ${session.get()}` } : {}), ...options.headers },
  });
  if (response.status === 401) { session.clear(); if (!path.includes('/auth/login')) location.assign('/login'); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error ?? 'Request failed');
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
