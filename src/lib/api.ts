// One place for the backend URL. Set VITE_API_URL when the site is deployed (e.g. Amplify).
// In production the site and API live on the same server, so use the page's own origin.
export const API_ORIGIN: string = (import.meta as any).env?.VITE_API_URL
  || ((import.meta as any).env?.PROD ? window.location.origin : 'http://localhost:3001');
export const API_BASE = `${API_ORIGIN}/api`;

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString('en-US')}`;

export function amortize(principal: number, apr: number, months: number) {
  const r = apr / 100 / 12;
  if (principal <= 0) return 0;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}
