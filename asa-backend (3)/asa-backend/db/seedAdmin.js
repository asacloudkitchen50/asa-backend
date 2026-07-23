const bcrypt = require('bcryptjs');
const db = require('./database');

/**
 * Creates the admin account from ADMIN_USERNAME / ADMIN_PASSWORD env vars if it doesn't
 * already exist. If it exists, leaves the existing password untouched (so restarts on
 * Render don't silently reset a password you changed later some other way).
 * Safe to call every time the server boots — this is how Render (free tier, no Shell
 * access) gets its admin account created automatically.
 */
function seedAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    return { error: 'ADMIN_USERNAME / ADMIN_PASSWORD not set — skipping admin seed.' };
  }

  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (existing) {
    return { message: `Admin "${username}" already exists — leaving password as-is.`, created: false };
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, passwordHash, Date.now());
  return { message: `Admin "${username}" created.`, created: true };
}

/**
 * Always creates or updates the admin's password to match ADMIN_PASSWORD env var.
 * Use this for the manual `npm run seed-admin` script when you deliberately want
 * to (re)set the password. Do NOT call this on every server startup — that would
 * silently reset a password you'd changed some other way.
 */
function upsertAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    return { error: 'Set ADMIN_USERNAME and ADMIN_PASSWORD in your .env file first.' };
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (existing) {
    db.prepare('UPDATE admins SET password_hash = ? WHERE username = ?').run(passwordHash, username);
    return { message: `Admin "${username}" password updated.`, created: false };
  }
  db.prepare('INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, passwordHash, Date.now());
  return { message: `Admin "${username}" created.`, created: true };
}

module.exports = { seedAdmin, upsertAdmin };
