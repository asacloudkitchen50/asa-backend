const bcrypt = require('bcryptjs');
const db = require('./database');

function seedAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    return {
      error: 'ADMIN_USERNAME / ADMIN_PASSWORD not set.'
    };
  }

  const existing = db.prepare(
    'SELECT id FROM admins WHERE username = ?'
  ).get(username);

  if (existing) {
    return {
      message: `Admin "${username}" already exists.`,
      created: false
    };
  }

  const hash = bcrypt.hashSync(password, 10);

  db.prepare(
    'INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)'
  ).run(username, hash, Date.now());

  return {
    message: `Admin "${username}" created.`,
    created: true
  };
}

module.exports = { seedAdmin };