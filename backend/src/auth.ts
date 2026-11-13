import jwt from 'jsonwebtoken'; import type { NextFunction, Request, RequestHandler, Response } from 'express'; import { q } from './db.js';
export interface User { id: number; name: string; email: string; role: 'admin' | 'writer'; status: string; can_publish: number; can_edit_all: number; can_grant: number }
export interface Member { id: number; name: string; email: string; phone: string | null; sub_until: string | null }
declare module 'express-serve-static-core' { interface Request { user?: User; member?: Member } }
const secret = (): string => process.env.JWT_SECRET ?? 'dev-secret-change-me';
// Idle timeout: staff sessions last 5 minutes and are renewed on every request (sliding window).
export const IDLE_MS = 5 * 60_000;
// Reader (member) sessions last 30 days; access to hot news is controlled by sub_until.
const MEMBER_MS = 30 * 24 * 60 * 60_000;
export const setCookie = (res: Response, id: number): void => { res.cookie('s', jwt.sign({ id, kind: 'staff' }, secret(), { expiresIn: Math.floor(IDLE_MS / 1000) }), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: IDLE_MS }); };
export const setMemberCookie = (res: Response, id: number): void => { res.cookie('m', jwt.sign({ id, kind: 'member' }, secret(), { expiresIn: Math.floor(MEMBER_MS / 1000) }), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: MEMBER_MS }); };
// Staff and reader accounts are re-read from the database on every request.
export async function loadUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const c = (req.cookies as Record<string, string> | undefined) ?? {};
  try { if (c.s) { const p = jwt.verify(c.s, secret()) as { id: number };
    const [u] = await q<User>("SELECT id,name,email,role,status,can_publish,can_edit_all,can_grant FROM users WHERE id=? AND status='active'", [p.id]); req.user = u; if (u) setCookie(res, u.id); } } catch { /* not logged in */ }
  try { if (c.m) { const p = jwt.verify(c.m, secret()) as { id: number };
    const [m] = await q<Member>('SELECT id,name,email,phone,sub_until FROM members WHERE id=?', [p.id]); req.member = m; } } catch { /* not logged in */ }
  next();
}
// CSRF: cookies are SameSite=Lax, and every write must carry a custom header (browsers block it cross-site).
export const csrf: RequestHandler = (req, res, next) => { if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.get('x-requested-with') === 'fetch') return next(); res.status(403).json({ error: 'Bad request origin' }); };
export const need = (role?: 'admin', right?: 'can_publish' | 'can_grant'): RequestHandler => (req, res, next) => {
  const u = req.user; if (!u) return void res.status(401).json({ error: 'Please log in' });
  if (role === 'admin' && u.role !== 'admin') return void res.status(403).json({ error: 'Admins only' });
  if (right && u.role !== 'admin' && !u[right]) return void res.status(403).json({ error: 'You do not have this right' }); next();
};
export const needMember: RequestHandler = (req, res, next) => { if (!req.member) return void res.status(401).json({ error: 'Please log in' }); next(); };
export const memberActive = (m?: Member): boolean => !!m?.sub_until && new Date(m.sub_until).getTime() > Date.now();
