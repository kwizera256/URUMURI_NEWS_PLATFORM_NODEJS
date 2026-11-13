import { createContext } from 'react';
export const Ctx = createContext({ user: null, member: null, lang: 'en', refresh: () => {} });
export const LANGS = { en: 'English', rw: 'Kinyarwanda', fr: 'Français' };
export const DATE_LOCALE = { en: 'en-GB', rw: 'rw-RW', fr: 'fr-FR' };
export const day = (d, lang = 'en') => { if (!d) return ''; const dt = new Date(String(d).replace(' ', 'T')); return isNaN(dt) ? String(d).slice(0, 10) : dt.toLocaleDateString(DATE_LOCALE[lang] || 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
export async function api(url, { method = 'GET', body } = {}) {
  const form = body instanceof FormData;
  const r = await fetch('/api' + url, { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch', ...(body && !form ? { 'Content-Type': 'application/json' } : {}) }, body: body && !form ? JSON.stringify(body) : body });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j;
}
