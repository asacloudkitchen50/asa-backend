const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'asafoods.db');
require('fs').mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('rider','restaurant')),
    name TEXT NOT NULL,
    business_name TEXT,
    business_type TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    city TEXT,
    aadhaar TEXT,
    account_holder TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    ifsc TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    appointment_sent_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT UNIQUE NOT NULL,
    restaurant TEXT,
    area TEXT,
    rider TEXT,
    order_value REAL DEFAULT 0,
    commission_rate REAL DEFAULT 12,
    status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('placed','picked','delivered','cancelled')),
    placed_at INTEGER NOT NULL,
    picked_at INTEGER,
    delivered_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS settlement_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start INTEGER NOT NULL,
    week_end INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    summary_json TEXT NOT NULL
  );
`);

module.exports = db;
