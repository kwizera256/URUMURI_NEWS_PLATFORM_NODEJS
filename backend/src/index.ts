import dns from 'dns/promises'; import express from 'express'; import path from 'path'; import fs from 'fs'; import crypto from 'crypto'; import helmet from 'helmet'; import cookieParser from 'cookie-parser'; import rateLimit from 'express-rate-limit';
import { mailReady, sendCode, sendMail } from './mail.js';
import multer from 'multer'; import bcrypt from 'bcryptjs'; import { z } from 'zod'; import PDFDocument from 'pdfkit'; import { q, run } from './db.js'; import { csrf, loadUser, memberActive, need, needMember, setCookie, setMemberCookie } from './auth.js';
const app = express(), root = import.meta.dirname, uploads = path.resolve(root, '../uploads'), dist = path.resolve(root, '../../frontend/dist');
const cdn = 'https://cdnjs.cloudflare.com';
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", cdn], styleSrc: ["'self'", "'unsafe-inline'", cdn, 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com', cdn],
  imgSrc: ["'self'", 'data:', 'blob:'], mediaSrc: ["'self'", 'blob:'], frameSrc: ['https://www.youtube-nocookie.com'], connectSrc: ["'self'"] } } }));
app.use(express.json({ limit: '200kb' }), cookieParser(), loadUser, csrf); app.use('/uploads', express.static(uploads));
const slow = rateLimit({ windowMs: 15 * 60_000, limit: 30 });
const store = multer({ limits: { fileSize: 60 * 1024 * 1024 }, storage: multer.diskStorage({ destination: uploads, filename: (_r, f, cb) => cb(null, crypto.randomBytes(8).toString('hex') + path.extname(f.originalname).toLowerCase()) }),
  fileFilter: (_r, f, cb) => cb(null, /\.(jpe?g|png|webp|gif|mp4|webm)$/i.test(f.originalname)) }).fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]);
const avatarStore = multer({ limits: { fileSize: 2 * 1024 * 1024 }, storage: multer.diskStorage({ destination: uploads, filename: (_r, f, cb) => cb(null, 'av-' + crypto.randomBytes(8).toString('hex') + path.extname(f.originalname).toLowerCase()) }),
  fileFilter: (_r, f, cb) => cb(null, /\.(jpe?g|png|webp|gif)$/i.test(f.originalname)) }).single('avatar');
const avatarUp: express.RequestHandler = (req, res, next) => avatarStore(req, res, (e) => e ? void res.status(422).json({ error: 'Profile picture must be an image under 2 MB' }) : next());
const SEL = `SELECT a.id,a.title,a.slug,a.summary,a.lang,a.image,a.video_type,a.video,a.is_hot,a.views,c.id category_id,c.name cat,c.slug cslug,u.name author,COALESCE(a.published_at,a.created_at) pub
 FROM articles a JOIN categories c ON c.id=a.category_id JOIN users u ON u.id=a.author_id`;
const ytId = (s: string): string => s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/)?.[1] ?? (/^[\w-]{11}$/.test(s) ? s : '');

const CONTACT_DEFAULTS: Record<string, string> = { contact_email: 'kwizeracyber1@gmail.com', contact_phone: '+25073021350', whatsapp: '+250793021350', contact_address: 'Kigali, Rwanda' };
type Contact = { contact_email: string; contact_phone: string; whatsapp: string; contact_address: string };
const siteContact = async (): Promise<Contact> => { try { const r = await q<{ skey: string; sval: string }>('SELECT skey,sval FROM settings WHERE skey IN (?,?,?,?)', ['contact_email', 'contact_phone', 'whatsapp', 'contact_address']); const m = Object.fromEntries(r.map(x => [x.skey, x.sval])) as Record<string, string>; return { contact_email: (m.contact_email || CONTACT_DEFAULTS.contact_email).trim(), contact_phone: (m.contact_phone || CONTACT_DEFAULTS.contact_phone).trim(), whatsapp: (m.whatsapp || CONTACT_DEFAULTS.whatsapp).trim(), contact_address: (m.contact_address || CONTACT_DEFAULTS.contact_address).trim() }; } catch { return { ...CONTACT_DEFAULTS } as Contact; } };
const footerLine = (c: Contact) => [c.contact_email, c.contact_phone, c.whatsapp ? 'WhatsApp: ' + c.whatsapp : '', c.contact_address].filter(Boolean).join(' | ');
const pdfFooter = (doc: PDFKit.PDFDocument, line: string, y: number) => { if (!line) return; doc.save(); doc.font('Helvetica').fontSize(7.5).fillColor('#777777').opacity(0.55).text(line, 36, y, { width: doc.page.width - 72, align: 'center', lineBreak: false, ellipsis: true }); doc.restore(); };

// ---- writer letters (PDF saved for admin + emailed) ----
type LetterKind = 'approval' | 'activation' | 'suspension' | 'resignation';
type L = 'en' | 'rw' | 'fr';
const pickL = (v: unknown): L => (v === 'rw' || v === 'fr' ? v : 'en');
const LBL: Record<L, Record<string, string>> = {
  en: { date: 'Date', to: 'To', by: 'Authorized by', admin: 'URUMURI NEWS Administration' },
  rw: { date: 'Itariki', to: 'Kuri', by: 'Byemejwe na', admin: 'Ubuyobozi bwa URUMURI NEWS' },
  fr: { date: 'Date', to: 'À', by: 'Autorisé par', admin: 'Administration de URUMURI NEWS' },
};
const letterMeta: Record<LetterKind, Record<L, { subject: string; title: string; text: (name: string, by: string, date: string) => string }>> = {
  approval: {
    en: { subject: 'URUMURI NEWS – Writer Approval', title: 'WRITER APPROVAL LETTER', text: (name, by, date) => `Dear ${name},\n\nWe are pleased to inform you that your URUMURI NEWS writer account has been approved${by ? ' by ' + by : ''} on ${date}.\n\nYou may sign in and begin publishing news on URUMURI NEWS in accordance with our editorial guidelines and policies. Please maintain accuracy, professionalism, and respect for our readers.\n\nSincerely,\nURUMURI NEWS Administration` },
    rw: { subject: 'URUMURI NEWS – Kwemererwa k’umwanditsi', title: 'IBARUWA YO KWEMERERWA UMUWANDITSI', text: (name, by, date) => `Nyakubahwa ${name},\n\nTurakwishimiye kukumenyesha ko konti yawe y’umwanditsi kuri URUMURI NEWS yemejwe${by ? ' na ' + by : ''} ku itariki ${date}.\n\nUshobora kwinjira ugatangira gutangaza amakuru kuri URUMURI NEWS ukurikiza amabwiriza n’amahame y’ubwanditsi. Turagusaba gukomeza ukuri, ubunyamwuga, no kubaha abasomyi.\n\nMurakoze,\nUbuyobozi bwa URUMURI NEWS` },
    fr: { subject: 'URUMURI NEWS – Approbation du rédacteur', title: 'LETTRE D’APPROBATION DU RÉDACTEUR', text: (name, by, date) => `Cher/Chère ${name},\n\nNous avons le plaisir de vous informer que votre compte rédacteur URUMURI NEWS a été approuvé${by ? ' par ' + by : ''} le ${date}.\n\nVous pouvez vous connecter et commencer à publier des actualités sur URUMURI NEWS conformément à nos règles éditoriales. Veuillez faire preuve d’exactitude, de professionnalisme et de respect envers nos lecteurs.\n\nCordialement,\nAdministration de URUMURI NEWS` },
  },
  activation: {
    en: { subject: 'URUMURI NEWS – Account Activation', title: 'WRITER ACTIVATION LETTER', text: (name, by, date) => `Dear ${name},\n\nYour URUMURI NEWS writer account has been activated${by ? ' by ' + by : ''} on ${date}.\n\nYou may now sign in and start publishing news on URUMURI NEWS in accordance with our editorial guidelines and policies. Please maintain accuracy, professionalism, and respect for our readers in every story you publish.\n\nSincerely,\nURUMURI NEWS Administration` },
    rw: { subject: 'URUMURI NEWS – Gukoresha konti', title: 'IBARUWA YO GUKORESHA KONTI Y’UMUWANDITSI', text: (name, by, date) => `Nyakubahwa ${name},\n\nKonti yawe y’umwanditsi kuri URUMURI NEWS yatangiye gukoreshwa${by ? ' na ' + by : ''} ku itariki ${date}.\n\nUbu ushobora kwinjira ugatangira gutangaza amakuru kuri URUMURI NEWS ukurikiza amabwiriza n’amahame y’ubwanditsi. Turagusaba gukomeza ukuri, ubunyamwuga, no kubaha abasomyi mu nkuru zose utangaza.\n\nMurakoze,\nUbuyobozi bwa URUMURI NEWS` },
    fr: { subject: 'URUMURI NEWS – Activation du compte', title: 'LETTRE D’ACTIVATION DU RÉDACTEUR', text: (name, by, date) => `Cher/Chère ${name},\n\nVotre compte rédacteur URUMURI NEWS a été activé${by ? ' par ' + by : ''} le ${date}.\n\nVous pouvez désormais vous connecter et commencer à publier des actualités sur URUMURI NEWS conformément à nos règles éditoriales. Veuillez faire preuve d’exactitude, de professionnalisme et de respect envers nos lecteurs.\n\nCordialement,\nAdministration de URUMURI NEWS` },
  },
  suspension: {
    en: { subject: 'URUMURI NEWS – Account Suspension Notice', title: 'WRITER SUSPENSION LETTER', text: (name, by, date) => `Dear ${name},\n\nThis letter informs you that your URUMURI NEWS writer account has been suspended${by ? ' by ' + by : ''} on ${date}.\n\nWhile suspended, you will not be able to access writer features or publish content. If you believe this is a mistake or wish to appeal, please contact the URUMURI NEWS administration.\n\nSincerely,\nURUMURI NEWS Administration` },
    rw: { subject: 'URUMURI NEWS – Ibaruwa yo guhagarikwa', title: 'IBARUWA YO GUHAGARIKWA K’UMUWANDITSI', text: (name, by, date) => `Nyakubahwa ${name},\n\nIyi baruwa irakumenyesha ko konti yawe y’umwanditsi kuri URUMURI NEWS yahagaritswe${by ? ' na ' + by : ''} ku itariki ${date}.\n\nMu gihe ihagaritswe, ntushobora gukoresha serivisi z’umwanditsi cyangwa gutangaza inkuru. Niba utekereza ko ari ikosa cyangwa ushaka kujurira, nyamuneka vugana n’ubuyobozi bwa URUMURI NEWS.\n\nMurakoze,\nUbuyobozi bwa URUMURI NEWS` },
    fr: { subject: 'URUMURI NEWS – Avis de suspension du compte', title: 'LETTRE DE SUSPENSION DU RÉDACTEUR', text: (name, by, date) => `Cher/Chère ${name},\n\nCette lettre vous informe que votre compte rédacteur URUMURI NEWS a été suspendu${by ? ' par ' + by : ''} le ${date}.\n\nPendant la suspension, vous ne pourrez pas accéder aux fonctions de rédaction ni publier de contenu. Si vous pensez qu’il s’agit d’une erreur ou souhaitez faire appel, veuillez contacter l’administration de URUMURI NEWS.\n\nCordialement,\nAdministration de URUMURI NEWS` },
  },
  resignation: {
    en: { subject: 'URUMURI NEWS – Account Closure / Resignation Acknowledgement', title: 'WRITER RESIGNATION / ACCOUNT CLOSURE LETTER', text: (name, by, date) => `Dear ${name},\n\nThis letter confirms that your URUMURI NEWS writer account has been closed${by ? ' by ' + by : ''} on ${date}.\n\nWe acknowledge the end of your writer access with URUMURI NEWS. If this closure was not requested by you, or if you need further information, please contact the URUMURI NEWS administration.\n\nThank you for your contribution.\n\nSincerely,\nURUMURI NEWS Administration` },
    rw: { subject: 'URUMURI NEWS – Ibaruwa yo gusoza / gufunga konti', title: 'IBARUWA YO GUSOZA AKAZI / GUFUNGA KONTI', text: (name, by, date) => `Nyakubahwa ${name},\n\nIyi baruwa yemeza ko konti yawe y’umwanditsi kuri URUMURI NEWS yafunzwe${by ? ' na ' + by : ''} ku itariki ${date}.\n\nTwemeza ko uburyo bwo kuba umwanditsi kuri URUMURI NEWS bwarangiye. Niba utasabye ko ifungwa cyangwa ukeneye ibisobanuro, nyamuneka vugana n’ubuyobozi bwa URUMURI NEWS.\n\nUrakoze ku ruhare rwawe.\n\nMurakoze,\nUbuyobozi bwa URUMURI NEWS` },
    fr: { subject: 'URUMURI NEWS – Clôture de compte / démission', title: 'LETTRE DE DÉMISSION / CLÔTURE DE COMPTE', text: (name, by, date) => `Cher/Chère ${name},\n\nCette lettre confirme que votre compte rédacteur URUMURI NEWS a été clôturé${by ? ' par ' + by : ''} le ${date}.\n\nNous prenons acte de la fin de votre accès rédacteur à URUMURI NEWS. Si cette clôture n’a pas été demandée par vous ou si vous avez besoin d’informations, veuillez contacter l’administration de URUMURI NEWS.\n\nMerci pour votre contribution.\n\nCordialement,\nAdministration de URUMURI NEWS` },
  },
};
const letterPdf = async (kind: LetterKind, name: string, email: string, by: string, lang: unknown = 'en'): Promise<{ subject: string; body: string; pdf: Buffer }> => {
  const Lc = pickL(lang), meta = letterMeta[kind][Lc], date = new Date().toISOString().slice(0, 10), body = meta.text(name, by, date), contact = await siteContact(), foot = footerLine(contact);
  const logo = [path.resolve(root, '../../frontend/public/logo.png'), path.resolve(root, '../../frontend/dist/logo.png')].find(p => fs.existsSync(p));
  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' }); const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    try { if (logo) doc.image(logo, (doc.page.width - 74) / 2, 32, { fit: [74, 44] }); } catch {}
    doc.moveDown(3.2);
    doc.font('Helvetica-Bold').fontSize(17).fillColor('#0b1b3a').text('URUMURI NEWS', { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#b8860b').text(meta.title, { align: 'center' }); doc.moveDown(0.9);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#d4af37').stroke(); doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(9.5).fillColor('#555').text(`${LBL[Lc].date}: ${date}`); doc.text(`${LBL[Lc].to}: ${name} <${email}>`); doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(10.5).fillColor('#111').text(body, { align: 'left', lineGap: 3, width: doc.page.width - 100 });
    const fy = Math.max(doc.y + 18, doc.page.height - 108);
    const y = fy > doc.page.height - 88 ? (doc.addPage(), doc.page.height - 108) : fy;
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor('#ccc').stroke();
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000').text(LBL[Lc].by + ':', 50, y + 8);
    doc.font('Helvetica').fontSize(9.5).fillColor('#000').text(by || LBL[Lc].admin, 50, y + 20);
    pdfFooter(doc, foot, doc.page.height - 34);
    doc.end();
  });
  return { subject: meta.subject, body, pdf };
};
const issueLetter = async (kind: LetterKind, user: { id?: number | null; name: string; email: string }, adminName: string, createdBy?: number | null, lang: unknown = 'en') => {
  try {
    await run(`CREATE TABLE IF NOT EXISTS writer_letters (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NULL, writer_name VARCHAR(100) NOT NULL, writer_email VARCHAR(150) NOT NULL, kind ENUM('approval','activation','suspension','resignation') NOT NULL, subject VARCHAR(255) NOT NULL, body MEDIUMTEXT NOT NULL, pdf MEDIUMBLOB NOT NULL, created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY user_id (user_id), KEY kind (kind), KEY created_at (created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    try { await run("ALTER TABLE writer_letters MODIFY kind ENUM('approval','activation','suspension','resignation') NOT NULL"); } catch {}
    const l = await letterPdf(kind, user.name, user.email, adminName, lang);
    await run('INSERT INTO writer_letters (user_id,writer_name,writer_email,kind,subject,body,pdf,created_by) VALUES (?,?,?,?,?,?,?,?)', [user.id ?? null, user.name, user.email, kind, l.subject, l.body, l.pdf, createdBy ?? null]);
    if (mailReady()) try { await sendMail(user.email, l.subject, l.body + '\n', { filename: `${kind}-letter-${user.name.replace(/[^a-z0-9]+/gi, '-')}.pdf`, content: l.pdf, contentType: 'application/pdf' }); } catch (e) { console.error('writer letter mail failed', e); }
  } catch (e) { console.error('issueLetter failed', e); }
};


app.get('/api/health', async (_q, res) => { const [r] = await q<{ n: number }>('SELECT COUNT(*) n FROM articles'); res.json({ ok: true, articles: r.n }); });   // replaces db_test.php
const PUBLIC_KEYS = ['contact_email', 'contact_phone', 'whatsapp', 'contact_address', 'x_url', 'instagram_url', 'facebook_url', 'youtube_channel_id', 'pay_mtn_on', 'pay_mtn_number', 'pay_mtn_name', 'pay_airtel_on', 'pay_airtel_number', 'pay_airtel_name', 'pay_note'];
app.get('/api/settings/public', async (_q, res) => { const r = await q<{ skey: string; sval: string }>('SELECT skey,sval FROM settings WHERE skey IN (?)', [PUBLIC_KEYS]); const m = Object.fromEntries(r.map(x => [x.skey, x.sval])); for (const k of Object.keys(CONTACT_DEFAULTS)) if (!String(m[k] ?? '').trim()) m[k] = CONTACT_DEFAULTS[k]; res.json(m); });
app.get('/api/categories', async (_q, res) => { res.json(await q('SELECT id,name,slug FROM categories ORDER BY id')); });

app.get('/api/articles', async (req, res) => {
  const { l, c, q: s, hot, p } = req.query as Record<string, string | undefined>, w = ["a.status='published'", 'a.is_hot=?'], a: unknown[] = [hot === '1' ? 1 : 0];
  if (l && ['en', 'rw', 'fr'].includes(l)) { w.push('a.lang=?'); a.push(l); } if (c) { w.push('c.slug=?'); a.push(c); } if (s) { w.push('(a.title LIKE ? OR a.summary LIKE ?)'); a.push(`%${s}%`, `%${s}%`); }
  const page = Math.max(1, Number(p) || 1), where = w.join(' AND ');
  const items = await q(`${SEL} WHERE ${where} ORDER BY pub DESC, a.id DESC LIMIT 12 OFFSET ?`, [...a, (page - 1) * 12]);
  const [t] = await q<{ n: number }>(`SELECT COUNT(*) n FROM articles a JOIN categories c ON c.id=a.category_id WHERE ${where}`, a); res.json({ items, total: t.n });
});
app.get('/api/articles/:slug', async (req, res) => {
  const [a] = await q<{ id: number; is_hot: number; category_id: number; lang: string; body?: string; video?: string | null }>(`${SEL} WHERE a.status='published' AND a.slug=?`, [req.params.slug]); if (!a) return void res.status(404).json({ error: 'Not found' });
  const locked = !!a.is_hot && !req.user && !memberActive(req.member); // staff or an active subscriber can read hot stories
  if (!locked) { const [b] = await q<{ body: string }>('SELECT body FROM articles WHERE id=?', [a.id]); a.body = b.body; } else delete a.video;
  await run('UPDATE articles SET views=views+1 WHERE id=?', [a.id]);
  res.json({ ...a, locked, related: await q(`${SEL} WHERE a.status='published' AND a.category_id=? AND a.id<>? AND a.lang=? ORDER BY pub DESC LIMIT 3`, [a.category_id, a.id, a.lang]) });
});

// ---- reader accounts, plans and payments (hot news access) ----
const memberOut = (m: { id: number; name: string; email: string; phone: string | null; sub_until: string | null }) => ({ id: m.id, name: m.name, email: m.email, phone: m.phone, sub_until: m.sub_until, active: memberActive(m) });
const validEmail = async (email: string) => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address'; const domain = email.split('@')[1]; try { const mx = await dns.resolveMx(domain); if (!mx.length) return 'Email domain cannot receive mail'; } catch { /* DNS lookup may be unavailable; do not block signup on transient resolver errors */ } return ''; };

app.post('/api/member/register', slow, async (req, res) => {
  const p = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(150), phone: z.string().trim().max(20).default(''), password: z.string().min(8).max(100) }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Name, valid email and 8+ character password required' });
  const email = p.data.email.toLowerCase(), bad = await validEmail(email); if (bad) return void res.status(422).json({ error: bad });
  if ((await q('SELECT id FROM members WHERE email=?', [email])).length) return void res.status(409).json({ error: 'Email already registered' });
  const r = await run('INSERT INTO members (name,email,phone,password) VALUES (?,?,?,?)', [p.data.name, email, p.data.phone || null, await bcrypt.hash(p.data.password, 10)]); setMemberCookie(res, r.insertId);
  const [m] = await q<{ id: number; name: string; email: string; phone: string | null; sub_until: string | null }>('SELECT id,name,email,phone,sub_until FROM members WHERE id=?', [r.insertId]);
  const devOtp = process.env.NODE_ENV !== 'production' ? await resetToken('member', email) : undefined;
  if (!devOtp) { const code = await resetToken('member', email); try { await sendCode(email, code, 'signup'); } catch (e) { console.error('signup otp mail failed', e); } }
  res.json({ ok: true, member: memberOut(m), ...(devOtp ? { email_otp: devOtp } : {}) });
});
app.post('/api/member/login', slow, async (req, res) => {
  const p = z.object({ email: z.string().email().max(150), password: z.string().min(1).max(100) }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Email and password required' });
  const [m] = await q<{ id: number; name: string; email: string; phone: string | null; sub_until: string | null; password: string }>('SELECT id,name,email,phone,sub_until,password FROM members WHERE email=?', [p.data.email.toLowerCase()]);
  if (!m || !(await bcrypt.compare(p.data.password, m.password.replace(/^\$2y\$/, '$2a$')))) return void res.status(401).json({ error: 'Wrong email or password' });
  setMemberCookie(res, m.id); res.json({ ok: true, member: memberOut(m) });
});
app.post('/api/member/logout', (_q, res) => { res.clearCookie('m'); res.json({ ok: true }); });
app.get('/api/member/me', (req, res) => { res.json(req.member ? memberOut(req.member) : null); });
app.post('/api/member/forgot', slow, async (req, res) => {
  const p = z.object({ email: z.string().email().max(150) }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Enter a valid email' });
  const email = p.data.email.toLowerCase(), [m] = await q<{ id: number }>('SELECT id FROM members WHERE email=?', [email]);
  if (m) { const token = await resetToken('member', email); if (mailReady()) { try { await sendCode(email, token, 'reset'); } catch (e) { console.error('member reset mail failed', e); } } if (process.env.NODE_ENV !== 'production') return void res.json({ ok: true, reset_token: token }); }
  res.json({ ok: true });
});
app.post('/api/member/reset', slow, async (req, res) => {
  const p = z.object({ email: z.string().email().max(150), token: z.string().min(10).max(200), password: z.string().min(8).max(100) }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Email, reset code and 8+ character password required' });
  if (!(await consumeReset('member', p.data.email.toLowerCase(), p.data.token, p.data.password))) return void res.status(422).json({ error: 'Reset code is invalid or expired' }); res.json({ ok: true });
});

app.get('/api/plans', async (_q, res) => { res.json(await q("SELECT id,name,days,price FROM plans WHERE status='active' ORDER BY days, price")); });
app.get('/api/member/payments', needMember, async (req, res) => { res.json(await q('SELECT id,plan_name,days,amount,method,payer_phone,txn_ref,status,note,created_at FROM payments WHERE member_id=? ORDER BY id DESC LIMIT 50', [req.member!.id])); });
app.post('/api/member/payments', needMember, slow, async (req, res) => {
  const p = z.object({ plan_id: z.coerce.number().int().positive(), method: z.enum(['mtn', 'airtel']), payer_phone: z.string().trim().min(8).max(20), txn_ref: z.string().trim().min(4).max(40) }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Choose a plan, payment method, your phone number and the transaction reference' });
  const [plan] = await q<{ id: number; name: string; days: number; price: number }>("SELECT id,name,days,price FROM plans WHERE id=? AND status='active'", [p.data.plan_id]); if (!plan) return void res.status(422).json({ error: 'Plan not found' });
  const [dup] = await q<{ id: number }>('SELECT id FROM payments WHERE method=? AND txn_ref=?', [p.data.method, p.data.txn_ref]); if (dup) return void res.status(409).json({ error: 'This transaction reference was already submitted' });
  await run('INSERT INTO payments (member_id,plan_id,plan_name,days,amount,method,payer_phone,txn_ref) VALUES (?,?,?,?,?,?,?,?)', [req.member!.id, plan.id, plan.name, plan.days, plan.price, p.data.method, p.data.payer_phone, p.data.txn_ref]);
  res.json({ ok: true });
});

// ---- admin: categories ----
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
app.get('/api/admin/categories', need('admin'), async (_q, res) => { res.json(await q('SELECT c.id,c.name,c.slug,(SELECT COUNT(*) FROM articles a WHERE a.category_id=c.id) article_count FROM categories c ORDER BY c.id')); });
app.post('/api/admin/categories', need('admin'), async (req, res) => {
  const p = z.object({ name: z.string().trim().min(2).max(60), slug: z.string().trim().max(60).optional() }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Category name is required' });
  const slug = slugify(p.data.slug || p.data.name); if (!slug) return void res.status(422).json({ error: 'Category slug is required' });
  if ((await q('SELECT id FROM categories WHERE slug=?', [slug])).length) return void res.status(409).json({ error: 'Category slug already exists' });
  const r = await run('INSERT INTO categories (name,slug) VALUES (?,?)', [p.data.name, slug]); res.json({ ok: true, id: r.insertId });
});
app.put('/api/admin/categories/:id', need('admin'), async (req, res) => {
  const p = z.object({ name: z.string().trim().min(2).max(60), slug: z.string().trim().max(60).optional() }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Category name is required' });
  const [cur] = await q<{ id: number }>('SELECT id FROM categories WHERE id=?', [req.params.id]); if (!cur) return void res.status(404).json({ error: 'Category not found' });
  const slug = slugify(p.data.slug || p.data.name); if (!slug) return void res.status(422).json({ error: 'Category slug is required' });
  if ((await q('SELECT id FROM categories WHERE slug=? AND id<>?', [slug, req.params.id])).length) return void res.status(409).json({ error: 'Category slug already exists' });
  await run('UPDATE categories SET name=?,slug=? WHERE id=?', [p.data.name, slug, req.params.id]); res.json({ ok: true });
});
app.delete('/api/admin/categories/:id', need('admin'), async (req, res) => {
  const [cur] = await q<{ id: number }>('SELECT id FROM categories WHERE id=?', [req.params.id]); if (!cur) return void res.status(404).json({ error: 'Category not found' });
  const [ref] = await q<{ n: number }>('SELECT COUNT(*) n FROM articles WHERE category_id=?', [req.params.id]); if (ref.n) return void res.status(409).json({ error: `Cannot delete: ${ref.n} article(s) use this category. Move or delete those articles first.` });
  await run('DELETE FROM categories WHERE id=?', [req.params.id]); res.json({ ok: true });
});

// ---- admin: site/contact/payment settings ----
const SET_KEYS = ['contact_email', 'contact_phone', 'whatsapp', 'contact_address', 'x_url', 'instagram_url', 'facebook_url', 'youtube_channel_id', 'pay_mtn_on', 'pay_mtn_number', 'pay_mtn_name', 'pay_airtel_on', 'pay_airtel_number', 'pay_airtel_name', 'pay_note'];
app.get('/api/admin/settings', need('admin'), async (_q, res) => { const r = await q<{ skey: string; sval: string }>('SELECT skey,sval FROM settings WHERE skey IN (?)', [SET_KEYS]); res.json(Object.fromEntries(r.map(x => [x.skey, x.sval]))); });
app.put('/api/admin/settings', need('admin'), async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  for (const k of SET_KEYS) if (Object.prototype.hasOwnProperty.call(b, k)) await run('INSERT INTO settings (skey,sval) VALUES (?,?) ON DUPLICATE KEY UPDATE sval=VALUES(sval)', [k, String(b[k] ?? '')]);
  res.json({ ok: true });
});

// ---- admin: hot news plans and payment approvals ----
app.get('/api/admin/plans', need('admin'), async (_q, res) => { res.json(await q('SELECT id,name,days,price,status,created_at FROM plans ORDER BY days, price')); });
app.post('/api/admin/plans', need('admin'), async (req, res) => {
  const p = z.object({ name: z.string().trim().min(2).max(80), days: z.coerce.number().int().min(1).max(3660), price: z.coerce.number().int().min(0) }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Plan name, days and price are required' });
  await run('INSERT INTO plans (name,days,price) VALUES (?,?,?)', [p.data.name, p.data.days, p.data.price]); res.json({ ok: true });
});
app.put('/api/admin/plans/:id', need('admin'), async (req, res) => {
  const p = z.object({ name: z.string().trim().min(2).max(80), days: z.coerce.number().int().min(1).max(3660), price: z.coerce.number().int().min(0), status: z.enum(['active', 'paused']) }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Invalid plan' });
  await run('UPDATE plans SET name=?,days=?,price=?,status=? WHERE id=?', [p.data.name, p.data.days, p.data.price, p.data.status, req.params.id]); res.json({ ok: true });
});
app.delete('/api/admin/plans/:id', need('admin'), async (req, res) => { await run('DELETE FROM plans WHERE id=?', [req.params.id]); res.json({ ok: true }); });

app.get('/api/admin/payments', need('admin'), async (req, res) => { const st = ['pending', 'approved', 'rejected'].includes(String(req.query.status)) ? req.query.status : 'pending';
  res.json(await q(`SELECT p.id,p.plan_name,p.days,p.amount,p.method,p.payer_phone,p.txn_ref,p.status,p.note,p.created_at,m.name member,m.email member_email FROM payments p JOIN members m ON m.id=p.member_id WHERE p.status=? ORDER BY p.id DESC LIMIT 200`, [st])); });
app.post('/api/admin/payments/:id/decide', need('admin'), async (req, res) => {
  const p = z.object({ status: z.enum(['approved', 'rejected']), note: z.string().trim().max(255).default('') }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Invalid decision' });
  const [pay] = await q<{ id: number; member_id: number; days: number; status: string }>('SELECT id,member_id,days,status FROM payments WHERE id=?', [req.params.id]); if (!pay) return void res.status(404).json({ error: 'Payment not found' });
  if (pay.status !== 'pending') return void res.status(409).json({ error: 'Payment already decided' });
  await run('UPDATE payments SET status=?,note=?,decided_at=NOW(),decided_by=? WHERE id=?', [p.data.status, p.data.note || null, req.user!.id, pay.id]);
  if (p.data.status === 'approved') await run('UPDATE members SET sub_until=DATE_ADD(GREATEST(COALESCE(sub_until,NOW()),NOW()), INTERVAL ? DAY) WHERE id=?', [pay.days, pay.member_id]);
  res.json({ ok: true });
});
app.post('/api/subscribe', slow, async (req, res) => { const p = z.object({ email: z.string().email().max(150) }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Enter a valid email' });
  await run('INSERT IGNORE INTO subscribers (email) VALUES (?)', [p.data.email.toLowerCase()]); res.json({ ok: true }); });

const resetToken = async (kind: 'staff' | 'member', email: string) => { const token = crypto.randomBytes(24).toString('hex'); const hash = crypto.createHash('sha256').update(token).digest('hex'); await run("DELETE FROM password_resets WHERE (kind=? AND email=?) OR expires_at < NOW() OR used_at IS NOT NULL", [kind, email]); await run('INSERT INTO password_resets (kind,email,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL 30 MINUTE))', [kind, email, hash]); return token; };
const consumeReset = async (kind: 'staff' | 'member', email: string, token: string, password: string) => {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const [r] = await q<{ id: number }>('SELECT id FROM password_resets WHERE kind=? AND email=? AND token_hash=? AND used_at IS NULL AND expires_at > NOW() ORDER BY id DESC LIMIT 1', [kind, email, hash]); if (!r) return false;
  await run('UPDATE ' + (kind === 'staff' ? 'users' : 'members') + ' SET password=? WHERE email=?', [await bcrypt.hash(password, 10), email]); await run('UPDATE password_resets SET used_at=NOW() WHERE id=?', [r.id]); return true;
};

app.post('/api/auth/forgot', slow, async (req, res) => {
  const p = z.object({ email: z.string().email().max(150) }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Enter a valid email' });
  const email = p.data.email.toLowerCase(), [u] = await q<{ id: number }>('SELECT id FROM users WHERE email=?', [email]);
  if (u) { const token = await resetToken('staff', email); if (mailReady()) { try { await sendCode(email, token, 'reset'); } catch (e) { console.error('staff reset mail failed', e); } } if (process.env.NODE_ENV !== 'production') return void res.json({ ok: true, reset_token: token }); }
  res.json({ ok: true });
});
app.post('/api/auth/reset', slow, async (req, res) => {
  const p = z.object({ email: z.string().email().max(150), token: z.string().min(10).max(200), password: z.string().min(8).max(100) }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Email, reset code and 8+ character password required' });
  if (!(await consumeReset('staff', p.data.email.toLowerCase(), p.data.token, p.data.password))) return void res.status(422).json({ error: 'Reset code is invalid or expired' }); res.json({ ok: true });
});

// ---- accounts (writers) ----
const Cred = z.object({ email: z.string().email().max(150), password: z.string().min(1).max(100) });
app.post('/api/auth/login', slow, async (req, res) => {
  const p = Cred.safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Email and password required' });
  const [u] = await q<{ id: number; password: string; status: string }>('SELECT id,password,status FROM users WHERE email=?', [p.data.email.toLowerCase()]);
  if (!u || !(await bcrypt.compare(p.data.password, u.password.replace(/^\$2y\$/, '$2a$')))) return void res.status(401).json({ error: 'Wrong email or password' });   // PHP hashes work unchanged
  if (u.status !== 'active') return void res.status(403).json({ error: u.status === 'pending' ? 'Your account is waiting for admin approval' : 'Account suspended' });
  setCookie(res, u.id); res.json({ ok: true });
});
app.post('/api/auth/register', slow, async (req, res) => {
  const p = Cred.extend({ name: z.string().trim().min(2).max(100), password: z.string().min(8).max(100) }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Name, valid email and 8+ character password required' });
  if ((await q('SELECT id FROM users WHERE email=?', [p.data.email.toLowerCase()])).length) return void res.status(409).json({ error: 'Email already registered' });
  await run("INSERT INTO users (name,email,password,role,status) VALUES (?,?,?,'writer','pending')", [p.data.name, p.data.email.toLowerCase(), await bcrypt.hash(p.data.password, 10)]); res.json({ ok: true });
});
app.post('/api/auth/logout', (_q, res) => { res.clearCookie('s'); res.json({ ok: true }); });
app.get('/api/auth/me', (req, res) => { res.json(req.user ?? null); });
app.post('/api/auth/ping', need(), (_q, res) => { res.json({ ok: true }); });   // keep-alive: the browser calls this only while the person is active

app.put('/api/auth/me', need(), async (req, res) => {
  const p = z.object({ name: z.string().trim().min(2).max(100).optional(), email: z.string().trim().email().max(150).optional(), password: z.string().min(8).max(100).optional() }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Invalid fields' });
  const d = p.data, u = req.user!, sets: string[] = [], args: unknown[] = [];
  if (d.name !== undefined) { sets.push('name=?'); args.push(d.name); }
  if (d.email !== undefined) { const email = d.email.toLowerCase(); if ((await q('SELECT id FROM users WHERE email=? AND id<>?', [email, u.id])).length) return void res.status(409).json({ error: 'Email already in use' }); sets.push('email=?'); args.push(email); }
  if (d.password !== undefined) { sets.push('password=?'); args.push(await bcrypt.hash(d.password, 10)); }
  if (!sets.length) return void res.status(422).json({ error: 'Nothing to update' });
  args.push(u.id); await run('UPDATE users SET ' + sets.join(',') + ' WHERE id=?', args); res.json({ ok: true });
});

// ---- writer dashboard ----
const Art = z.object({ title: z.string().trim().min(3).max(255), summary: z.string().trim().max(300).default(''), body: z.string().trim().min(10), lang: z.enum(['en', 'rw', 'fr']), category_id: z.coerce.number().int().positive(), is_hot: z.coerce.number().min(0).max(1).default(0), youtube: z.string().trim().default('') });
app.get('/api/writer/articles', need(), async (req, res) => { res.json(await q(`SELECT a.id,a.title,a.slug,a.status,a.views,a.lang,a.created_at FROM articles a WHERE a.author_id=? ORDER BY a.id DESC LIMIT 100`, [req.user!.id])); });
app.post('/api/writer/articles', need(), store, async (req, res) => {
  const p = Art.safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Check the form: title, text, language and category are required' });
  const f = req.files as { image?: Express.Multer.File[]; video?: Express.Multer.File[] }, u = req.user!, d = p.data, vf = f.video?.[0]?.filename, yt = ytId(d.youtube), pub = u.role === 'admin' || u.can_publish === 1;
  const slug = d.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) + '-' + crypto.randomBytes(3).toString('hex');
  await run(`INSERT INTO articles (title,slug,summary,body,lang,image,video_type,video,category_id,author_id,is_hot,status,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,${pub ? 'NOW()' : 'NULL'})`,
    [d.title, slug, d.summary, d.body, d.lang, f.image?.[0]?.filename ?? null, vf ? 'upload' : yt ? 'youtube' : 'none', vf ?? (yt || null), d.category_id, u.id, d.is_hot, pub ? 'published' : 'pending']); res.json({ ok: true, status: pub ? 'published' : 'pending' });
});
app.delete('/api/writer/articles/:id', need(), async (req, res) => { const u = req.user!; await run(`DELETE FROM articles WHERE id=? ${u.role === 'admin' ? '' : 'AND author_id=?'}`, u.role === 'admin' ? [req.params.id] : [req.params.id, u.id]); res.json({ ok: true }); });

// ---- staff with rights ----
app.get('/api/manage/articles', need(undefined, 'can_publish'), async (req, res) => { const s = req.query.status === 'published' ? 'published' : 'pending';
  res.json(await q(`SELECT a.id,a.title,a.slug,a.status,a.lang,u.name author,a.created_at FROM articles a JOIN users u ON u.id=a.author_id WHERE a.status=? ORDER BY a.id DESC LIMIT 100`, [s])); });
app.post('/api/manage/articles/:id/approve', need(undefined, 'can_publish'), async (req, res) => { await run("UPDATE articles SET status='published', published_at=NOW() WHERE id=?", [req.params.id]); res.json({ ok: true }); });
app.get('/api/team', need(undefined, 'can_grant'), async (_q, res) => { res.json(await q('SELECT id,name,email,avatar,role,status,can_publish,can_edit_all,can_grant,created_at FROM users ORDER BY id DESC')); });

app.get('/api/team/export', need(undefined, 'can_grant'), async (req, res) => {
  const { status, role, can_publish, can_edit_all, can_grant, from, to, format, fields } = req.query as Record<string, string | undefined>;
  const w: string[] = [], a: unknown[] = [];
  if (status) { w.push('status=?'); a.push(status); }
  if (role) { w.push('role=?'); a.push(role); }
  if (can_publish !== undefined && can_publish !== '') { w.push('can_publish=?'); a.push(can_publish === '1' ? 1 : 0); }
  if (can_edit_all !== undefined && can_edit_all !== '') { w.push('can_edit_all=?'); a.push(can_edit_all === '1' ? 1 : 0); }
  if (can_grant !== undefined && can_grant !== '') { w.push('can_grant=?'); a.push(can_grant === '1' ? 1 : 0); }
  if (from) { w.push('DATE(created_at)>=?'); a.push(from); }
  if (to) { w.push('DATE(created_at)<=?'); a.push(to); }
  const allCols: Record<string, [string, (r: any) => string]> = { name: ['Name', r => r.name], email: ['Email', r => r.email], role: ['Role', r => r.role], status: ['Status', r => r.status], can_publish: ['Publish', r => r.can_publish ? 'Yes' : 'No'], can_edit_all: ['Edit all', r => r.can_edit_all ? 'Yes' : 'No'], can_grant: ['Grant rights', r => r.can_grant ? 'Yes' : 'No'], created_at: ['Joined', r => String(r.created_at).slice(0, 10)] };
  const pick = (fields ? fields.split(',').filter(f => allCols[f]) : Object.keys(allCols));
  const cols = (pick.length ? pick : Object.keys(allCols)).filter(f => allCols[f]);
  const rows = await q<any>(`SELECT name,email,role,status,can_publish,can_edit_all,can_grant,created_at FROM users${w.length ? ' WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC`, a);
  if (format === 'pdf') {
    const admins = await q<{ name: string }>("SELECT name FROM users WHERE role='admin' AND status='active' ORDER BY id");
    const adminNames = admins.map(a => a.name).join(', ') || req.user!.name;
    const logo = [path.resolve(root, '../../frontend/public/logo.png'), path.resolve(root, '../../frontend/dist/logo.png')].find(p => fs.existsSync(p));
    const contact = await siteContact(), foot = footerLine(contact);
    const landscape = cols.length > 4;
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'attachment; filename=team.pdf');
    const doc = new PDFDocument({ margin: 28, size: 'A4', layout: landscape ? 'landscape' : 'portrait' }); doc.pipe(res);
    try { if (logo) doc.image(logo, (doc.page.width - 60) / 2, 18, { fit: [60, 36] }); } catch {}
    doc.y = 58;
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0b1b3a').text('URUMURI NEWS - Team export', { align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor('#555').text('Generated ' + new Date().toISOString().slice(0, 10) + ' · ' + rows.length + ' member(s)' + (from || to ? ' · Joined ' + (from || '…') + ' to ' + (to || '…') : ''), { align: 'center' }); doc.moveDown(0.5); doc.fillColor('#000');
    const W = (doc.page.width - 56) / cols.length, headY = doc.y; doc.font('Helvetica-Bold').fontSize(8);
    cols.forEach((c, i) => doc.text(allCols[c][0], 28 + i * W, headY, { width: W - 3, lineBreak: false, ellipsis: true })); doc.y = headY + 11; doc.moveTo(28, doc.y).lineTo(doc.page.width - 28, doc.y).strokeColor('#ccc').stroke(); doc.y += 3; doc.font('Helvetica').fontSize(7.6).strokeColor('#000');
    rows.forEach(r => { if (doc.y > doc.page.height - 64) { doc.addPage(); doc.y = 28; } const y = doc.y; cols.forEach((c, i) => doc.text(String(allCols[c][1](r) ?? ''), 28 + i * W, y, { width: W - 3, lineBreak: false, ellipsis: true })); doc.y = y + 10.5; });
    const fy = Math.min(doc.y + 8, doc.page.height - 58); if (fy > doc.page.height - 52) doc.addPage();
    const y0 = Math.max(Math.min(doc.y + 8, doc.page.height - 58), 40); doc.moveTo(28, y0).lineTo(doc.page.width - 28, y0).strokeColor('#ccc').stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text('Director General of URUMURI NEWS: ', 28, y0 + 5, { continued: true }).font('Helvetica').text(adminNames);
    pdfFooter(doc, foot, doc.page.height - 22);
    doc.end(); return;
  }
  const esc = (v: string | number) => '"' + String(v).replace(/"/g, '""') + '"';
  const header = cols.map(c => allCols[c][0]).join(','); const body = rows.map(r => cols.map(c => esc(allCols[c][1](r))).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename=team.csv'); res.send(header + '\n' + body);
});
app.put('/api/team/:id', need(undefined, 'can_grant'), async (req, res) => {
  const p = z.object({ status: z.enum(['pending', 'active', 'suspended']), can_publish: z.number().min(0).max(1), can_edit_all: z.number().min(0).max(1), can_grant: z.number().min(0).max(1), letter_lang: z.enum(['en', 'rw', 'fr']).optional() }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Invalid' });
  const [u] = await q<{ id: number; name: string; email: string; status: string; role: string }>("SELECT id,name,email,status,role FROM users WHERE id=? AND role<>'admin'", [req.params.id]); if (!u) return void res.status(404).json({ error: 'Writer not found' });
  await run("UPDATE users SET status=?,can_publish=?,can_edit_all=?,can_grant=? WHERE id=? AND role<>'admin'", [p.data.status, p.data.can_publish, p.data.can_edit_all, p.data.can_grant, req.params.id]);
  if (u.status !== p.data.status && p.data.status === 'active') await issueLetter(u.status === 'pending' ? 'approval' : 'activation', u, req.user!.name, req.user!.id, p.data.letter_lang);
  if (u.status !== p.data.status && p.data.status === 'suspended') await issueLetter('suspension', u, req.user!.name, req.user!.id, p.data.letter_lang);
  res.json({ ok: true });
});

app.delete('/api/team/:id', need('admin'), async (req, res) => {
  if (Number(req.params.id) === req.user!.id) return void res.status(422).json({ error: 'Cannot delete your own account' });
  const [u] = await q<{ id: number; name: string; email: string }>("SELECT id,name,email FROM users WHERE id=? AND role<>'admin'", [req.params.id]); if (!u) return void res.status(404).json({ error: 'Writer not found' });
  await issueLetter('resignation', u, req.user!.name, req.user!.id, (req.query.lang as string) || 'en');
  await run("DELETE FROM users WHERE id=? AND role<>'admin'", [req.params.id]); res.json({ ok: true });
});

app.post('/api/team/:id/letter', need('admin'), async (req, res) => {
  const p = z.object({ kind: z.enum(['approval', 'activation', 'suspension', 'resignation']), lang: z.enum(['en', 'rw', 'fr']).default('en') }).safeParse(req.body); if (!p.success) return void res.status(422).json({ error: 'Invalid letter request' });
  const [u] = await q<{ id: number; name: string; email: string }>("SELECT id,name,email FROM users WHERE id=? AND role<>'admin'", [req.params.id]); if (!u) return void res.status(404).json({ error: 'Writer not found' });
  await issueLetter(p.data.kind, u, req.user!.name, req.user!.id, p.data.lang);
  res.json({ ok: true });
});

// Admin adds a writer directly: email, password, profile picture and rights in one step (account is active at once, no approval needed).
const Flag = z.coerce.number().min(0).max(1).default(0);
app.post('/api/team', need('admin'), avatarUp, async (req, res) => {
  const p = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(150), password: z.string().min(8).max(100), status: z.enum(['pending', 'active', 'suspended']).default('active'), can_publish: Flag, can_edit_all: Flag, can_grant: Flag, letter_lang: z.enum(['en', 'rw', 'fr']).default('en') }).safeParse(req.body);
  if (!p.success) return void res.status(422).json({ error: 'Name, valid email and 8+ character password required' });
  const d = p.data, email = d.email.toLowerCase(); if ((await q('SELECT id FROM users WHERE email=?', [email])).length) return void res.status(409).json({ error: 'Email already registered' });
  const r = await run("INSERT INTO users (name,email,password,avatar,role,status,can_publish,can_edit_all,can_grant) VALUES (?,?,?,?,'writer',?,?,?,?)", [d.name, email, await bcrypt.hash(d.password, 10), req.file?.filename ?? null, d.status, d.can_publish, d.can_edit_all, d.can_grant]);
  if (d.status === 'active') await issueLetter('activation', { id: r.insertId, name: d.name, email }, req.user!.name, req.user!.id, d.letter_lang);
  res.json({ ok: true, id: r.insertId, email, password: d.password });
});
app.post('/api/team/:id/avatar', need('admin'), avatarUp, async (req, res) => {
  if (!req.file) return void res.status(422).json({ error: 'Choose an image (jpg, png, webp or gif)' });
  const r = await run("UPDATE users SET avatar=? WHERE id=? AND role<>'admin'", [req.file.filename, req.params.id]); if (!r.affectedRows) return void res.status(404).json({ error: 'Writer not found' }); res.json({ ok: true, avatar: req.file.filename });
});

// Admin resets a writer's password: leave "password" empty to get a generated temporary one (shown once).
app.post('/api/team/:id/reset-password', need('admin'), async (req, res) => {
  const p = z.object({ password: z.string().min(8).max(100).optional() }).safeParse(req.body ?? {}); if (!p.success) return void res.status(422).json({ error: 'Password must be 8+ characters' });
  const pw = p.data.password || crypto.randomBytes(9).toString('base64url');
  const [t] = await q<{ id: number; email: string }>("SELECT id,email FROM users WHERE id=? AND role<>'admin'", [req.params.id]); if (!t) return void res.status(404).json({ error: 'Writer not found' });
  await run('UPDATE users SET password=? WHERE id=?', [await bcrypt.hash(pw, 10), t.id]); res.json({ ok: true, email: t.email, password: pw });
});

// ---- admin: writer letters (saved PDFs; emailed on issue) ----
app.get('/api/admin/letters', need('admin'), async (req, res) => {
  try {
    await run(`CREATE TABLE IF NOT EXISTS writer_letters (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NULL, writer_name VARCHAR(100) NOT NULL, writer_email VARCHAR(150) NOT NULL, kind ENUM('approval','activation','suspension','resignation') NOT NULL, subject VARCHAR(255) NOT NULL, body MEDIUMTEXT NOT NULL, pdf MEDIUMBLOB NOT NULL, created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY user_id (user_id), KEY kind (kind), KEY created_at (created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    try { await run("ALTER TABLE writer_letters MODIFY kind ENUM('approval','activation','suspension','resignation') NOT NULL"); } catch {}
    const w: string[] = [], a: unknown[] = [];
    if (req.query.kind && ['approval', 'activation', 'suspension', 'resignation'].includes(String(req.query.kind))) { w.push('l.kind=?'); a.push(req.query.kind); }
    if (req.query.user_id) { w.push('l.user_id=?'); a.push(Number(req.query.user_id)); }
    res.json(await q(`SELECT l.id,l.user_id,l.writer_name,l.writer_email,l.kind,l.subject,l.created_at,u.name created_by_name FROM writer_letters l LEFT JOIN users u ON u.id=l.created_by${w.length ? ' WHERE ' + w.join(' AND ') : ''} ORDER BY l.id DESC LIMIT 200`, a));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/admin/letters/:id/download', need('admin'), async (req, res) => {
  const [l] = await q<{ writer_name: string; kind: string; pdf: Buffer }>('SELECT writer_name,kind,pdf FROM writer_letters WHERE id=?', [req.params.id]); if (!l) return void res.status(404).json({ error: 'Letter not found' });
  const name = (l.writer_name || 'writer').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=${l.kind}-letter-${name}-${req.params.id}.pdf`); res.send(l.pdf);
});

app.use('/api', (_q, res) => { res.status(404).json({ error: 'Not found' }); });
app.use(express.static(dist)); app.get(/.*/, (_q, res) => { res.sendFile(path.join(dist, 'index.html'), (e) => { if (e) res.status(404).send('Run "npm run build" first, or use "npm run dev" and open http://localhost:5173'); }); });
app.use((e: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { console.error(e); res.status(500).json({ error: 'Server error' }); });
app.listen(Number(process.env.PORT ?? 3001), () => console.log('API on http://localhost:' + (process.env.PORT ?? 3001)));
