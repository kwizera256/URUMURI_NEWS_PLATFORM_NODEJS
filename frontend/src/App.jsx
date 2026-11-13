import { useCallback, useEffect, useRef, useState } from 'react'; import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'; import { AnimatePresence, motion } from 'framer-motion';
import { api, Ctx, LANGS } from './api'; import { tr } from './i18n'; import { ICONS } from './icons'; import { Article, Home, HotAccess } from './Public'; import { CategoriesAdmin, Dashboard, HotNewsAdmin, Login, Manage, Register, Team, WriterLetters } from './Staff';
const Icon = ({ k, c = 'w-5 h-5' }) => <svg viewBox="0 0 24 24" className={c} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[k] }} />;
const IDLE = 5 * 60_000, WARN = 30_000;   // log out after 5 minutes without action; warn 30 seconds before
function IdleGuard({ user, onOut, lang }) { // signed-in staff only: any mouse, key, scroll or touch counts as action
  const last = useRef(Date.now()), ping = useRef(0), [left, setLeft] = useState(null);
  useEffect(() => { if (!user) return; last.current = Date.now(); setLeft(null);
    const act = () => { last.current = Date.now(); if (Date.now() - ping.current > 60_000) { ping.current = Date.now(); api('/auth/ping', { method: 'POST' }).catch(() => {}); } };
    const ev = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']; ev.forEach(e => window.addEventListener(e, act, { passive: true }));
    const t = setInterval(() => { const idle = Date.now() - last.current; if (idle >= IDLE) { sessionStorage.setItem('flash', tr(lang, 'You were logged out after 5 minutes of inactivity. Please log in again.')); onOut(); } else setLeft(idle >= IDLE - WARN ? Math.ceil((IDLE - idle) / 1000) : null); }, 1000);
    return () => { ev.forEach(e => window.removeEventListener(e, act)); clearInterval(t); }; }, [user?.id, lang]);
  return left === null ? null : <div role="alert" className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-ink text-white rounded-xl shadow-lg px-4 py-3 text-sm flex items-center gap-3">{tr(lang, 'You will be logged out in')} {left}{tr(lang, 's due to inactivity.')}<button onClick={() => { last.current = Date.now(); api('/auth/ping', { method: 'POST' }).catch(() => {}); }} className="bg-sun text-ink font-bold rounded-full px-3 py-1">{tr(lang, 'Stay logged in')}</button></div>;
}
function CookieBanner({ lang, consent, setConsent, open, close }) {
  if (consent && !open) return null; const pick = (v) => { setConsent(v); close(); };
  return (<div role="dialog" aria-label="Cookies" className="fixed bottom-0 inset-x-0 z-50 bg-navy text-stone-100 border-t-4 border-sun p-4"><div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3 justify-between">
    <p className="text-sm flex-1 min-w-[16rem]">{tr(lang, 'We always use one essential login cookie for staff. Optional cookies remember your language choice. Do you accept them?')} <Link to="/privacy#cookies" className="underline text-sun">{tr(lang, 'Privacy policy')}</Link></p>
    <div className="flex gap-2"><button onClick={() => pick('rejected')} className="border border-white/40 rounded-full px-4 py-1.5 font-semibold hover:bg-white/10">{tr(lang, 'Reject')}</button><button onClick={() => pick('accepted')} className="bg-sun text-ink rounded-full px-4 py-1.5 font-bold">{tr(lang, 'Accept')}</button></div></div></div>);
}
const LOC = { en: 'en-GB', rw: 'rw', fr: 'fr-FR' };
function TopBar({ lang, setLang }) {
  const [now, setNow] = useState(new Date()), [temp, setTemp] = useState('');
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { fetch('https://api.open-meteo.com/v1/forecast?latitude=-1.9441&longitude=30.0619&current=temperature_2m&timezone=Africa%2FKigali').then(r => r.json()).then(d => setTemp(Math.round(d.current.temperature_2m) + '°C')).catch(() => {}); }, []);
  const l = LOC[lang], date = `${now.toLocaleDateString(l, { weekday: 'long' })}, ${now.toLocaleDateString(l, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return (<div className="bg-navy text-stone-200 text-sm"><div className="max-w-6xl mx-auto px-4 py-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
    <p className="flex items-center gap-3"><span>{date}</span><span className="font-bold text-sun">{now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Kigali', hour: '2-digit', minute: '2-digit' })}</span><span title="Kigali">{temp}</span></p>
    <div className="flex items-center gap-1">{Object.entries(LANGS).map(([k, n]) => <button key={k} onClick={() => setLang(k)} className={'px-2.5 py-0.5 rounded-full ' + (lang === k ? 'bg-sun text-ink font-bold' : 'hover:bg-white/10')}>{n}</button>)}</div></div></div>);
}
function Header({ lang, setLang, cats, user, st, onOut }) {
  const nav = useNavigate(), loc = useLocation(), [q, setQ] = useState(''), seg = loc.pathname.split('/'), cur = seg[1] === 'c' ? seg[2] : null, hot = loc.pathname.startsWith('/hot');
  const tab = (on) => 'px-3 py-2.5 border-b-4 ' + (on ? 'border-sun text-brand font-bold' : 'border-transparent hover:text-brand');
  return (<><TopBar lang={lang} setLang={setLang} /><header className="bg-white border-b border-stone-200 sticky top-0 z-40">
    <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2"><Link to="/" className="shrink-0"><img src="/logo.png" alt="URUMURI NEWS" className="h-12 w-auto" /></Link>
      <form onSubmit={e => { e.preventDefault(); if (q.trim()) nav('/search?q=' + encodeURIComponent(q.trim())); }} className="flex-1 min-w-[12rem] max-w-md flex order-last sm:order-none w-full sm:w-auto">
        <input value={q} onChange={e => setQ(e.target.value)} required placeholder={tr(lang, 'Search news')} className="w-full min-w-0 border border-stone-300 rounded-l-full px-4 py-2 focus:outline-none focus:border-brand focus:ring-2 focus:ring-sun" /><button className="bg-brand text-white font-bold px-4 rounded-r-full hover:bg-ink">{tr(lang, 'Search')}</button></form>
      <nav className="ml-auto flex items-center gap-4 text-sm font-medium">{st.youtube_channel_id && <Link to="/live" className="inline-flex items-center gap-1.5 bg-red-600 text-white px-3 py-1 rounded-full font-bold"><span className="w-2 h-2 rounded-full bg-white animate-pulse" />{tr(lang, 'Live')}</Link>}
        {user && <><Link to="/dashboard" className="hover:text-brand">{tr(lang, 'Dashboard')}</Link>{user.role === 'admin' && <><Link to="/team" className="hover:text-brand">{tr(lang, 'Team')}</Link><Link to="/categories" className="hover:text-brand">{tr(lang, 'Categories')}</Link><Link to="/letters" className="hover:text-brand">{tr(lang, 'Letters')}</Link><Link to="/hot-admin" className="hover:text-brand">{tr(lang, 'Hot news')}</Link></>}<button onClick={onOut} className="hover:text-brand">{tr(lang, 'Log out')}</button></>}</nav></div>
    <nav className="border-t border-stone-100 bg-white"><div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto font-medium text-[0.95rem] whitespace-nowrap">
      <Link to="/" className={tab(loc.pathname === '/')}>{tr(lang, 'Home')}</Link>
      <Link to="/hot/access" className={'px-3 py-2.5 border-b-4 inline-flex items-center gap-1.5 font-bold ' + (hot ? 'border-red-600 text-red-700' : 'border-transparent text-red-600 hover:text-red-700')}><span className="w-2 h-2 rounded-full bg-red-600" />{tr(lang, 'Hot news')}</Link>
      {cats.map(c => <Link key={c.slug} to={'/c/' + c.slug} className={tab(cur === c.slug)}>{tr(lang, c.name)}</Link>)}</div></nav></header></>);
}
function Footer({ lang, st, onCookies }) {
  const [m, setM] = useState(''), [msg, setMsg] = useState(''), wa = st.whatsapp ? 'https://wa.me/' + st.whatsapp.replace(/\D/g, '') : '', dot = 'w-9 h-9 rounded-full bg-white/10 text-sun flex items-center justify-center shrink-0', h = 'font-display font-bold text-white text-lg mb-3';
  const sub = async (e) => { e.preventDefault(); try { await api('/subscribe', { method: 'POST', body: { email: m } }); setMsg('ok'); setM(''); } catch { setMsg('bad'); } };
  const soc = [['x_url', 'X', 'x', st.x_url], ['instagram_url', 'Instagram', 'instagram', st.instagram_url], ['facebook_url', 'Facebook', 'facebook', st.facebook_url], ['wa', 'WhatsApp', 'whatsapp', wa]].filter(s => s[3]);
  return (<footer className="bg-navy text-stone-300 mt-12 border-t-4 border-sun"><div className="max-w-6xl mx-auto px-4 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
    <div><img src="/logo.png" alt="URUMURI NEWS" className="h-20 w-auto bg-white rounded-xl p-2" /><p className="text-sm mt-3">{tr(lang, 'News that brings light.')}</p></div>
    <div><h3 className={h}>{tr(lang, 'Contact us')}</h3><ul className="space-y-3 text-sm">
      {st.contact_email && <li className="flex items-center gap-3"><span className={dot}><Icon k="mail" /></span><a href={'mailto:' + st.contact_email} className="hover:text-sun break-all">{st.contact_email}</a></li>}
      {st.contact_phone && <li className="flex items-center gap-3"><span className={dot}><Icon k="phone" /></span><a href={'tel:' + st.contact_phone.replace(/[^0-9+]/g, '')} className="hover:text-sun">{st.contact_phone}</a></li>}
      {wa && <li className="flex items-center gap-3"><span className={dot}><Icon k="whatsapp" /></span><a href={wa} target="_blank" rel="noopener noreferrer" className="hover:text-sun">WhatsApp: {st.whatsapp}</a></li>}
      {st.contact_address && <li className="flex items-center gap-3"><span className={dot}><Icon k="pin" /></span><span>{st.contact_address}</span></li>}</ul></div>
    <div><h3 className={h}>{tr(lang, 'Follow us')}</h3><div className="flex gap-3">{soc.map(([k, n, ic, u]) => <a key={k} href={u} target="_blank" rel="noopener noreferrer" aria-label={n} title={n} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-sun hover:text-ink transition-colors"><Icon k={ic} /></a>)}</div>
      <h3 className="font-display font-bold text-white text-lg mt-6 mb-2">{tr(lang, 'Quick links')}</h3><ul className="space-y-1 text-sm">
        <li><Link to="/" className="hover:text-sun">{tr(lang, 'Home')}</Link></li>{st.youtube_channel_id && <li><Link to="/live" className="hover:text-sun">{tr(lang, 'Live')}</Link></li>}<li><Link to="/hot/access" className="hover:text-sun">{tr(lang, 'Hot news')}</Link></li>
        <li><Link to="/privacy" className="hover:text-sun">{tr(lang, 'Privacy policy')}</Link></li><li><Link to="/login" className="hover:text-sun">{tr(lang, 'Log in')}</Link></li></ul></div>
    <div><h3 className={h}>{tr(lang, 'Subscribe')}</h3><p className="text-sm mb-3">{tr(lang, 'Get the latest updates by email.')}</p>{msg && <p className={'text-sm p-2 rounded-lg mb-2 ' + (msg === 'ok' ? 'bg-sun text-ink' : 'bg-red-100 text-red-800')}>{msg === 'ok' ? tr(lang, 'Thanks for subscribing.') : tr(lang, 'Enter a valid email address.')}</p>}
      <form onSubmit={sub} className="flex"><input type="email" required value={m} onChange={e => setM(e.target.value)} placeholder={tr(lang, 'Your email address')} className="w-full min-w-0 rounded-l-full px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-sun" /><button className="bg-sun text-ink font-bold px-4 rounded-r-full hover:bg-white">{tr(lang, 'Subscribe')}</button></form></div></div>
    <div className="border-t border-white/10"><div className="max-w-6xl mx-auto px-4 py-4 text-sm flex flex-wrap items-center justify-center gap-x-5 gap-y-2"><p>&copy; {new Date().getFullYear()} URUMURI NEWS. {tr(lang, 'All rights reserved.')}</p>
      <Link to="/privacy" className="underline hover:text-sun">{tr(lang, 'Privacy policy')}</Link><button onClick={onCookies} className="underline hover:text-sun">{tr(lang, 'Cookie settings')}</button></div></div></footer>);
}
const Privacy = () => <main className="max-w-3xl mx-auto px-4 mt-8 space-y-3"><h1 className="font-display font-extrabold text-3xl">Privacy policy</h1><p>URUMURI NEWS stores only what is needed to run the site: your email if you subscribe, and account details for staff.</p><h2 id="cookies" className="font-display font-bold text-xl pt-3">Cookies</h2><p>We always use one essential login cookie for staff accounts; it ends after 5 minutes without activity. Optional cookies only remember your language choice, and you can accept or reject them at any time using Cookie settings in the footer. We do not sell personal data.</p></main>;
function RouteLoader() {
  const loc = useLocation(), [show, setShow] = useState(false);
  useEffect(() => { setShow(true); const t = setTimeout(() => setShow(false), 350); return () => clearTimeout(t); }, [loc.pathname, loc.search]);
  return <AnimatePresence>{show && <motion.div key="route-loader" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }} style={{ transformOrigin: 'left' }} className="fixed top-0 left-0 right-0 h-1 bg-sun z-[70]" />}</AnimatePresence>;
}
function BootLoader({ show }) {
  return <AnimatePresence>{show && <motion.div key="boot" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="page-loader" role="status" aria-live="polite"><div className="flex flex-col items-center gap-3"><div className="spinner" /><div className="font-bold text-ink tracking-wide">URUMURI NEWS</div></div></motion.div>}</AnimatePresence>;
}
export default function App() {
  const [user, setUser] = useState(null), [member, setMember] = useState(null), [cats, setCats] = useState([]), [st, setSt] = useState({}), [lang, setLang] = useState(['en', 'rw', 'fr'].includes(localStorage.lang) && localStorage.cookie_consent === 'accepted' ? localStorage.lang : 'en'), loc = useLocation(), [consent, setConsentS] = useState(localStorage.cookie_consent || ''), [cookieOpen, setCookieOpen] = useState(false), [booting, setBooting] = useState(true);
  const setConsent = (v) => { localStorage.cookie_consent = v; setConsentS(v); if (v === 'rejected') localStorage.removeItem('lang'); };
  const signOut = useCallback(async () => { try { await api('/auth/logout', { method: 'POST' }); } catch {} setUser(null); }, []);
  const refresh = useCallback(async () => { const [u, m] = await Promise.all([api('/auth/me').catch(() => null), api('/member/me').catch(() => null)]); setUser(u); setMember(m); }, []);
  useEffect(() => { (async () => { try { await Promise.all([refresh(), api('/categories').then(setCats).catch(() => {}), api('/settings/public').then(setSt).catch(() => {})]); } finally { setBooting(false); } })(); }, [refresh]);
  useEffect(() => { if (consent === 'accepted') localStorage.lang = lang; document.documentElement.lang = lang; }, [lang, consent]); useEffect(() => { if (!loc.hash) window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => { const $ = window.jQuery, $b = $('#top'), f = () => ($(window).scrollTop() > 400 ? $b.fadeIn(150) : $b.fadeOut(150));   // jQuery: back-to-top + ticker pause
    $(window).on('scroll', f); $b.on('click', () => $('html,body').animate({ scrollTop: 0 }, 400));
    $(document).on('mouseenter', '.tick', function () { $(this).css('animation-play-state', 'paused'); }).on('mouseleave', '.tick', function () { $(this).css('animation-play-state', 'running'); });
    return () => { $(window).off('scroll', f); $b.off('click'); $(document).off('mouseenter mouseleave', '.tick'); }; }, []);
  return (<Ctx.Provider value={{ user, member, lang, st, refresh }}><div className="min-h-screen flex flex-col">
    <RouteLoader /><BootLoader show={booting} />
    <Header lang={lang} setLang={setLang} cats={cats} user={user} st={st} onOut={signOut} />
    <motion.div key={loc.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex-1">
      <Routes><Route path="/" element={<Home />} /><Route path="/hot" element={<HotAccess />} /><Route path="/hot/access" element={<HotAccess />} /><Route path="/c/:cat" element={<Home />} /><Route path="/search" element={<Home />} /><Route path="/a/:slug" element={<Article />} /><Route path="/privacy" element={<Privacy />} />
        <Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} /><Route path="/dashboard" element={<Dashboard />} /><Route path="/manage" element={<Manage />} /><Route path="/team" element={<Team />} /><Route path="/categories" element={<CategoriesAdmin />} /><Route path="/letters" element={<WriterLetters />} /><Route path="/hot-admin" element={<HotNewsAdmin />} /><Route path="*" element={<p className="p-8">{tr(lang, 'Page not found.')}</p>} /></Routes></motion.div>
    <Footer lang={lang} st={st} onCookies={() => setCookieOpen(true)} />
    <IdleGuard user={user} onOut={signOut} lang={lang} /><CookieBanner lang={lang} consent={consent} setConsent={setConsent} open={cookieOpen} close={() => setCookieOpen(false)} />
    <button id="top" style={{ display: 'none' }} className="fixed bottom-5 right-5 bg-sun text-ink w-11 h-11 rounded-full font-bold shadow-lg" aria-label="Back to top">&uarr;</button></div></Ctx.Provider>);
}
