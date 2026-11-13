-- =====================================================================
-- URUMURI NEWS - MAIN DATABASE (single file)
-- Replaces: database.sql, upgrade.sql, upgrade_video.sql, upgrade_ads.sql,
--           upgrade_mail.sql, update_email.sql
-- Safe to import on an empty database AND to re-run on an existing one
-- (CREATE TABLE IF NOT EXISTS / INSERT IGNORE: nothing is overwritten).
-- Older installs are upgraded automatically by includes/schema.php on first page load.
-- =====================================================================
SET NAMES utf8mb4;

-- ---------- Staff ----------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  avatar VARCHAR(100) NULL,
  role ENUM('admin','writer') NOT NULL DEFAULT 'writer',
  status ENUM('pending','active','suspended') NOT NULL DEFAULT 'pending',
  can_publish TINYINT(1) NOT NULL DEFAULT 0,
  can_edit_all TINYINT(1) NOT NULL DEFAULT 0,
  can_grant TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Content ----------
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  slug VARCHAR(60) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS articles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(280) NOT NULL UNIQUE,
  summary VARCHAR(300),
  body MEDIUMTEXT NOT NULL,
  lang ENUM('en','rw','fr') NOT NULL DEFAULT 'en',
  image VARCHAR(100),
  video_type ENUM('none','upload','youtube') NOT NULL DEFAULT 'none',
  video VARCHAR(255) NULL,
  category_id INT NOT NULL,
  author_id INT NOT NULL,
  status ENUM('pending','published') NOT NULL DEFAULT 'pending',
  views INT NOT NULL DEFAULT 0,
  is_hot TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  updated_by INT NULL,
  notified_at TIMESTAMP NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Site settings ----------
CREATE TABLE IF NOT EXISTS settings (
  skey VARCHAR(50) PRIMARY KEY,
  sval VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- UI translations (admin-editable i18n overrides) ----------
CREATE TABLE IF NOT EXISTS translations (
  lang ENUM('en','rw','fr') NOT NULL,
  tkey VARCHAR(255) NOT NULL,
  tval TEXT NOT NULL,
  PRIMARY KEY (lang, tkey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Subscribers + email queue ----------
CREATE TABLE IF NOT EXISTS subscribers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(150) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mail_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  article_id INT NOT NULL,
  subscriber_id INT NOT NULL,
  status ENUM('queued','sent','failed') NOT NULL DEFAULT 'queued',
  tries TINYINT NOT NULL DEFAULT 0,
  sent_at TIMESTAMP NULL,
  error VARCHAR(255) NULL,
  UNIQUE KEY u (article_id, subscriber_id),
  KEY st (status),
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Advertising ----------
CREATE TABLE IF NOT EXISTS ads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(200) NULL,
  url VARCHAR(500) NOT NULL,
  image VARCHAR(100) NULL,
  placement ENUM('top','inline','bottom') NOT NULL DEFAULT 'inline',
  status ENUM('active','paused') NOT NULL DEFAULT 'active',
  starts_at DATE NULL,
  ends_at DATE NULL,
  views INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Hot news: reader accounts, plans, payments ----------
CREATE TABLE IF NOT EXISTS members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20) NULL,
  password VARCHAR(255) NOT NULL,
  sub_until DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  days INT NOT NULL,
  price INT NOT NULL,
  status ENUM('active','paused') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_id INT NOT NULL,
  plan_id INT NULL,
  plan_name VARCHAR(80) NOT NULL,
  days INT NOT NULL,
  amount INT NOT NULL,
  method ENUM('mtn','airtel') NOT NULL,
  payer_phone VARCHAR(20) NOT NULL,
  txn_ref VARCHAR(40) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL,
  decided_by INT NULL,
  UNIQUE KEY txn (method, txn_ref),
  KEY st (status),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Default data (never overwrites existing values) ----------
INSERT INTO categories (name, slug)
SELECT * FROM (
  SELECT 'Rwanda' n,'rwanda' s UNION ALL SELECT 'Africa','africa' UNION ALL SELECT 'World','world'
  UNION ALL SELECT 'Politics','politics' UNION ALL SELECT 'Business','business' UNION ALL SELECT 'Sports','sports'
  UNION ALL SELECT 'Entertainment','entertainment' UNION ALL SELECT 'Technology','technology'
  UNION ALL SELECT 'Health','health' UNION ALL SELECT 'Education','education'
) d WHERE NOT EXISTS (SELECT 1 FROM categories);

INSERT IGNORE INTO settings (skey, sval) VALUES
('youtube_channel_id',''),
('contact_email','kwizeracyber1@gmail.com'),
('contact_phone','+25073021350'),
('whatsapp','+250793021350'),
('contact_address','Kigali, Rwanda'),
('x_url','https://x.com/'),
('instagram_url','https://instagram.com/'),
('facebook_url','https://facebook.com/'),
('pay_mtn_on','1'),('pay_mtn_number',''),('pay_mtn_name',''),
('pay_airtel_on','1'),('pay_airtel_number',''),('pay_airtel_name',''),
('pay_note','');

-- Seed default UI translations (never overwrites existing values)
INSERT INTO translations (lang, tkey, tval)
SELECT * FROM (
  SELECT 'en' n,'Accept' k,'Accept' v UNION ALL SELECT 'en','Reject','Reject'
  UNION ALL SELECT 'en','We always use one essential login cookie for staff. Optional cookies remember your language choice. Do you accept them?','We always use one essential login cookie for staff. Optional cookies remember your language choice. Do you accept them?'
  UNION ALL SELECT 'en','Home','Home' UNION ALL SELECT 'en','Hot news','Hot news'
  UNION ALL SELECT 'en','Search news','Search news' UNION ALL SELECT 'en','Search','Search'
  UNION ALL SELECT 'en','Live','Live' UNION ALL SELECT 'en','Latest','Latest'
  UNION ALL SELECT 'en','Contact us','Contact us' UNION ALL SELECT 'en','Follow us','Follow us'
  UNION ALL SELECT 'en','Quick links','Quick links' UNION ALL SELECT 'en','Subscribe','Subscribe'
  UNION ALL SELECT 'en','Get the latest updates by email.','Get the latest updates by email.'
  UNION ALL SELECT 'en','Your email address','Your email address' UNION ALL SELECT 'en','Privacy policy','Privacy policy'
  UNION ALL SELECT 'en','Cookie settings','Cookie settings' UNION ALL SELECT 'en','All rights reserved.','All rights reserved.'
  UNION ALL SELECT 'en','News that brings light.','News that brings light.' UNION ALL SELECT 'en','Log in','Log in'
  UNION ALL SELECT 'en','Log out','Log out' UNION ALL SELECT 'en','Rwanda','Rwanda' UNION ALL SELECT 'en','Africa','Africa'
  UNION ALL SELECT 'en','World','World' UNION ALL SELECT 'en','Politics','Politics' UNION ALL SELECT 'en','Business','Business'
  UNION ALL SELECT 'en','Sports','Sports' UNION ALL SELECT 'en','Entertainment','Entertainment' UNION ALL SELECT 'en','Technology','Technology'
  UNION ALL SELECT 'en','Health','Health' UNION ALL SELECT 'en','Education','Education'
) d WHERE NOT EXISTS (SELECT 1 FROM translations WHERE lang='en' AND tkey=d.k);

INSERT INTO translations (lang, tkey, tval)
SELECT * FROM (
  SELECT 'rw' n,'Accept' k,'Emera' v UNION ALL SELECT 'rw','Reject','Anga'
  UNION ALL SELECT 'rw','We always use one essential login cookie for staff. Optional cookies remember your language choice. Do you accept them?','Dukoresha cookie imwe ya ngombwa yo kwinjira ku bakozi. Izindi cookies zibika ururimi wahisemo. Urazemera?'
  UNION ALL SELECT 'rw','Home','Ahabanza' UNION ALL SELECT 'rw','Hot news','Amakuru ashyushye'
  UNION ALL SELECT 'rw','Search news','Shakisha amakuru' UNION ALL SELECT 'rw','Search','Shakisha'
  UNION ALL SELECT 'rw','Live','Imbonankubone' UNION ALL SELECT 'rw','Latest','Amakuru mashya'
  UNION ALL SELECT 'rw','Contact us','Twandikire' UNION ALL SELECT 'rw','Follow us','Dukurikire'
  UNION ALL SELECT 'rw','Quick links','Ihuza ryihuse' UNION ALL SELECT 'rw','Subscribe','Iyandikishe'
  UNION ALL SELECT 'rw','Get the latest updates by email.','Wakira amakuru mashya kuri imeri.'
  UNION ALL SELECT 'rw','Your email address','Imeri yawe' UNION ALL SELECT 'rw','Privacy policy','Politiki y’ibanga'
  UNION ALL SELECT 'rw','Cookie settings','Igenamiterere rya cookies' UNION ALL SELECT 'rw','All rights reserved.','Uburenganzira bwose burasigasirwa.'
  UNION ALL SELECT 'rw','News that brings light.','Amakuru atanga urumuri.' UNION ALL SELECT 'rw','Log in','Injira'
  UNION ALL SELECT 'rw','Log out','Sohoka' UNION ALL SELECT 'rw','Rwanda','Rwanda' UNION ALL SELECT 'rw','Africa','Afurika'
  UNION ALL SELECT 'rw','World','Amahanga' UNION ALL SELECT 'rw','Politics','Politiki' UNION ALL SELECT 'rw','Business','Ubucuruzi'
  UNION ALL SELECT 'rw','Sports','Imikino' UNION ALL SELECT 'rw','Entertainment','Imyidagaduro' UNION ALL SELECT 'rw','Technology','Ikoranabuhanga'
  UNION ALL SELECT 'rw','Health','Ubuzima' UNION ALL SELECT 'rw','Education','Uburezi'
) d WHERE NOT EXISTS (SELECT 1 FROM translations WHERE lang='rw' AND tkey=d.k);

INSERT INTO translations (lang, tkey, tval)
SELECT * FROM (
  SELECT 'fr' n,'Accept' k,'Accepter' v UNION ALL SELECT 'fr','Reject','Refuser'
  UNION ALL SELECT 'fr','We always use one essential login cookie for staff. Optional cookies remember your language choice. Do you accept them?',"Nous utilisons toujours un cookie de connexion essentiel pour le personnel. Les cookies facultatifs mémorisent votre langue. Les acceptez-vous ?"
  UNION ALL SELECT 'fr','Home','Accueil' UNION ALL SELECT 'fr','Hot news','Infos exclusives'
  UNION ALL SELECT 'fr','Search news','Rechercher des articles' UNION ALL SELECT 'fr','Search','Rechercher'
  UNION ALL SELECT 'fr','Live','En direct' UNION ALL SELECT 'fr','Latest','À la une'
  UNION ALL SELECT 'fr','Contact us','Contact' UNION ALL SELECT 'fr','Follow us','Suivez-nous'
  UNION ALL SELECT 'fr','Quick links','Liens rapides' UNION ALL SELECT 'fr',"Subscribe","S'abonner"
  UNION ALL SELECT 'fr','Get the latest updates by email.','Recevez les dernières actualités par e-mail.'
  UNION ALL SELECT 'fr','Your email address','Votre adresse e-mail' UNION ALL SELECT 'fr','Privacy policy','Politique de confidentialité'
  UNION ALL SELECT 'fr','Cookie settings','Paramètres des cookies' UNION ALL SELECT 'fr','All rights reserved.','Tous droits réservés.'
  UNION ALL SELECT 'fr',"News that brings light.","L'actualité qui éclaire." UNION ALL SELECT 'fr','Log in','Se connecter'
  UNION ALL SELECT 'fr','Log out','Se déconnecter' UNION ALL SELECT 'fr','Rwanda','Rwanda' UNION ALL SELECT 'fr','Africa','Afrique'
  UNION ALL SELECT 'fr','World','Monde' UNION ALL SELECT 'fr','Politics','Politique' UNION ALL SELECT 'fr','Business','Économie'
  UNION ALL SELECT 'fr','Sports','Sport' UNION ALL SELECT 'fr','Entertainment','Divertissement' UNION ALL SELECT 'fr','Technology','Technologie'
  UNION ALL SELECT 'fr','Health','Santé' UNION ALL SELECT 'fr','Education','Éducation'
) d WHERE NOT EXISTS (SELECT 1 FROM translations WHERE lang='fr' AND tkey=d.k);

-- ---------- Writer letters (admin-saved, emailed) ----------
CREATE TABLE IF NOT EXISTS writer_letters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  writer_name VARCHAR(100) NOT NULL,
  writer_email VARCHAR(150) NOT NULL,
  kind ENUM('approval','activation','suspension','resignation') NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  pdf MEDIUMBLOB NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY user_id (user_id),
  KEY kind (kind),
  KEY created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin accounts always keep every right
UPDATE users SET can_publish=1, can_edit_all=1, can_grant=1 WHERE role='admin';
