// usage: npm run create-admin -- email password "Full Name"   (replaces install.php)
import bcrypt from 'bcryptjs'; import { run, pool } from './db.js';
const [email, password, name = 'Admin'] = process.argv.slice(2);
if (!email || !password) { console.error('Usage: npm run create-admin -- email password "Full Name"'); process.exit(1); }
await run("INSERT INTO users (name,email,password,role,status,can_publish,can_edit_all,can_grant) VALUES (?,?,?, 'admin','active',1,1,1) ON DUPLICATE KEY UPDATE password=VALUES(password), role='admin', status='active', can_publish=1, can_edit_all=1, can_grant=1", [name, email.toLowerCase(), await bcrypt.hash(password, 10)]);
console.log('Admin ready:', email); await pool.end();
