const TOKEN_KEY = 'campusmate_session';
const STUDENT_TOKEN_KEY = 'campusmate_student_session';
const API_ORIGIN = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export const session = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const studentSession = {
  get: () => localStorage.getItem(STUDENT_TOKEN_KEY),
  set: (token: string) => localStorage.setItem(STUDENT_TOKEN_KEY, token),
  clear: () => localStorage.removeItem(STUDENT_TOKEN_KEY),
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

export async function studentApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${API_ORIGIN}/api${apiPath}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(studentSession.get() ? { Authorization: `Bearer ${studentSession.get()}` } : {}), ...options.headers },
  });
  if (response.status === 401) { studentSession.clear(); if (!path.includes('/auth/student-login')) location.assign('/student-login'); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error ?? 'Request failed');
  }
  return response.json();
}
