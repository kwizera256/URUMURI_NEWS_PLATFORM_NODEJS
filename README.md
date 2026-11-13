# URUMURI NEWS - React + TypeScript (no PHP)
Client: React 18, Vite, React Router, Tailwind, Framer Motion, jQuery + Video.js (Cloudflare cdnjs, npm fallback), core-js.  Backend: Node.js + Express 5 + TypeScript, MySQL, JWT cookie, zod, multer, helmet.

## Run on your PC (Node 26.13.0 / npm 11.20.0, VS Code)
1. Create a MySQL database (e.g. `urumuri_news`) and import `database.sql` (phpMyAdmin > Import, or `mysql -u root -p urumuri_news < database.sql`).
   - Existing install: ensure these tables exist: `members`, `plans`, `payments` (see `database.sql`). Also ensure `settings` has payment keys: `pay_mtn_on/number/name`, `pay_airtel_on/number/name`, `pay_note`.
2. Copy `.env.example` to `.env` in this folder and fill in DB_* and JWT_SECRET.
3. `npm install`
4. Create your admin (replaces install.php): `npm run create-admin -- you@example.com YourPassword "Your Name"`  (your old PHP accounts also still work).
5. `npm run dev`  ->  open http://localhost:5173   (API check, replaces db_test.php: http://localhost:3001/api/health)

## Production on your PC / a server
`npm run build` then `npm start` -> open http://localhost:3001 (Express serves the built site, API and /uploads together).
Host on a Node host (VPS, Render, Railway) with MySQL and a persistent disk for `backend/uploads`. InfinityFree cannot run Node.js.
Before going live, add `integrity="sha384-..."` hashes from cdnjs.com to the 3 CDN tags in `frontend/index.html`.

## Features
Public site (ticker, slider, languages, categories, search, story + Video.js/YouTube, subscribe), writer register/login, dashboard with image/video upload, approvals, team (status + rights).

## Hot news access (readers)
- Clicking a locked hot story prompts the reader to **log in or create an account** at `/hot/access`.
- Reader chooses a plan (**per day / week / month / year** — configured by admin) and submits payment via **MTN Mobile Money** or **Airtel Money** (phone number + transaction reference).
- Admin confirms payments in **Dashboard ? Hot news** (`/hot-admin`), which activates access (`members.sub_until`) for the plan duration.
- Configure receiving numbers in `settings`: `pay_mtn_on/number/name`, `pay_airtel_on/number/name`, `pay_note`.

## Staff
Staff auto-logout after 5 min without action (30 s warning), admin Reset password in Team page, cookie Accept/Reject banner (Cookie settings in footer reopens it).
