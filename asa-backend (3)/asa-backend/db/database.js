const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'asafoods.db');
require('fs').mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// ---- Pre-migration: if an OLD `orders` table exists (from before the restaurant/menu system),
// its `status` CHECK constraint only allows ('placed','picked','delivered','cancelled') and can't
// accept the new statuses ('accepted','preparing','ready'). SQLite can't alter a CHECK constraint
// in place, so we rename the old table aside; it gets rebuilt with the new schema below, and any
// existing rows are copied back in afterwards.
const existingOrdersCols = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
const isOldOrdersSchema = existingOrdersCols.length > 0 && !existingOrdersCols.includes('restaurant_id');
if (isOldOrdersSchema) {
  db.exec('ALTER TABLE orders RENAME TO orders_old_v1');
}

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
    access_pin TEXT,
    restaurant_id INTEGER REFERENCES restaurants(id),
    is_online INTEGER NOT NULL DEFAULT 0,
    last_seen_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS restaurants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    business_type TEXT,
    city TEXT,
    address TEXT,
    phone TEXT,
    image_url TEXT,
    commission_rate REAL DEFAULT 12,
    is_active INTEGER NOT NULL DEFAULT 1,
    partner_id INTEGER REFERENCES partners(id),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT,
    is_veg INTEGER NOT NULL DEFAULT 1,
    is_available INTEGER NOT NULL DEFAULT 1,
    image_url TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT UNIQUE NOT NULL,
    restaurant_id INTEGER REFERENCES restaurants(id),
    restaurant TEXT,
    area TEXT,
    address TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    rider_id INTEGER REFERENCES partners(id),
    rider TEXT,
    order_value REAL DEFAULT 0,
    commission_rate REAL DEFAULT 12,
    payment_method TEXT NOT NULL DEFAULT 'cod' CHECK (payment_method IN ('cod','online')),
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid')),
    status TEXT NOT NULL DEFAULT 'placed' CHECK (
      status IN ('placed','accepted','preparing','ready','picked','delivered','cancelled')
    ),
    placed_at INTEGER NOT NULL,
    accepted_at INTEGER,
    ready_at INTEGER,
    picked_at INTEGER,
    delivered_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    menu_item_id INTEGER REFERENCES menu_items(id),
    name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS settlement_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start INTEGER NOT NULL,
    week_end INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    summary_json TEXT NOT NULL
  );
`);

// Copy any pre-existing orders (old schema) into the rebuilt table, then drop the old copy.
if (isOldOrdersSchema) {
  db.exec(`
    INSERT INTO orders (order_code, restaurant, area, rider, order_value, commission_rate, status, placed_at, picked_at, delivered_at)
    SELECT order_code, restaurant, area, rider, order_value, commission_rate, status, placed_at, picked_at, delivered_at
    FROM orders_old_v1;
  `);
  db.exec('DROP TABLE orders_old_v1');
  console.log('[db] Migrated existing orders table to the new restaurant/rider order-lifecycle schema.');
}

// Lightweight column migration for the `partners` table (existing databases created before these columns existed).
const partnerCols = db.prepare("PRAGMA table_info(partners)").all().map((c) => c.name);
if (!partnerCols.includes('access_pin')) db.exec('ALTER TABLE partners ADD COLUMN access_pin TEXT');
if (!partnerCols.includes('restaurant_id')) db.exec('ALTER TABLE partners ADD COLUMN restaurant_id INTEGER');
if (!partnerCols.includes('is_online')) db.exec('ALTER TABLE partners ADD COLUMN is_online INTEGER NOT NULL DEFAULT 0');
if (!partnerCols.includes('last_seen_at')) db.exec('ALTER TABLE partners ADD COLUMN last_seen_at INTEGER');

module.exports = db;
