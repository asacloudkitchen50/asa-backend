// Run with: npm run seed-admin
// Creates (or updates) the admin account using ADMIN_USERNAME / ADMIN_PASSWORD from .env
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db/database');

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;

if (!username || !password) {
  console.error('Set ADMIN_USERNAME and ADMIN_PASSWORD in your .env file first.');
  process.exit(1);
}

const passwordHash = bcrypt.hashSync(password, 10);

const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
if (existing) {
  db.prepare('UPDATE admins SET password_hash = ? WHERE username = ?').run(passwordHash, username);
  console.log(`Admin "${username}" password updated.`);
} else {
  db.prepare('INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, passwordHash, Date.now());
  console.log(`Admin "${username}" created.`);
}
