const express = require('express');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { requireRestaurant, requireRider } = require('../middleware/partnerAuth');

const router = express.Router();

function nextOrderCode() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM orders').get();
  return 'ASA' + String(1000 + row.n + 1);
}

// ============ CUSTOMER-FACING ============

router.post('/', (req, res) => {
  const { restaurantId, customerName, customerPhone, address, area, paymentMethod, items } = req.body || {};

  if (!restaurantId || !customerName || !customerPhone || !address || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'restaurantId, customerName, customerPhone, address and at least one item are required.' });
  }
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ? AND is_active = 1').get(restaurantId);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found or not currently active.' });

  const orderValue = items.reduce((sum, it) => sum + (Number(it.price) * Number(it.quantity || 1)), 0);
  const orderCode = nextOrderCode();
  const now = Date.now();
  const method = paymentMethod === 'online' ? 'online' : 'cod';

  const info = db.prepare(
    `INSERT INTO orders
      (order_code, restaurant_id, restaurant, area, address, customer_name, customer_phone,
       order_value, commission_rate, payment_method, payment_status, status, placed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'placed', ?)`
  ).run(orderCode, restaurantId, restaurant.name, area || restaurant.city, address, customerName,
        customerPhone, orderValue, restaurant.commission_rate || 12, method, now);

  const orderId = info.lastInsertRowid;
  const insertItem = db.prepare('INSERT INTO order_items (order_id, menu_item_id, name, price, quantity) VALUES (?, ?, ?, ?, ?)');
  for (const it of items) {
    insertItem.run(orderId, it.menuItemId || null, it.name, it.price, it.quantity || 1);
  }

  res.status(201).json({ orderId, orderCode, orderValue, paymentMethod: method });
});

router.get('/track/:orderCode', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(req.params.orderCode);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ ...order, items });
});

// ============ RESTAURANT DASHBOARD ============

router.get('/restaurant/mine', requireRestaurant, (req, res) => {
  const restaurantId = req.partner.restaurantId;
  if (!restaurantId) return res.status(400).json({ error: 'No restaurant linked to this account yet.' });
  const rows = db.prepare(
    `SELECT * FROM orders WHERE restaurant_id = ? ORDER BY placed_at DESC LIMIT 100`
  ).all(restaurantId);
  const withItems = rows.map((o) => ({ ...o, items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id) }));
  res.json(withItems);
});

router.patch('/:id/restaurant-status', requireRestaurant, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['accepted', 'preparing', 'ready', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.restaurant_id !== req.partner.restaurantId) return res.status(403).json({ error: 'This order does not belong to your restaurant.' });

  const fields = { status };
  if (status === 'accepted') fields.accepted_at = Date.now();
  if (status === 'ready') fields.ready_at = Date.now();
  const setClause = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE orders SET ${setClause} WHERE id = ?`).run(...Object.values(fields), req.params.id);

  res.json({ ok: true });
});

// ============ RIDER DASHBOARD ============

router.post('/rider/online', requireRider, (req, res) => {
  const { online } = req.body || {};
  db.prepare('UPDATE partners SET is_online = ?, last_seen_at = ? WHERE id = ?')
    .run(online ? 1 : 0, Date.now(), req.partner.sub);
  res.json({ ok: true, online: !!online });
});

router.get('/rider/available', requireRider, (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM orders WHERE status = 'ready' AND rider_id IS NULL ORDER BY ready_at ASC LIMIT 50`
  ).all();
  res.json(rows);
});

router.get('/rider/mine', requireRider, (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM orders WHERE rider_id = ? AND status NOT IN ('delivered','cancelled') ORDER BY placed_at DESC`
  ).all(req.partner.sub);
  res.json(rows);
});

router.post('/:id/accept', requireRider, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.status !== 'ready') return res.status(409).json({ error: 'This order is not ready for pickup yet.' });
  if (order.rider_id) return res.status(409).json({ error: 'Another rider has already accepted this order.' });

  const rider = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.partner.sub);
  db.prepare('UPDATE orders SET rider_id = ?, rider = ? WHERE id = ?').run(rider.id, rider.name, order.id);
  res.json({ ok: true });
});

router.patch('/:id/rider-status', requireRider, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['picked', 'delivered'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.rider_id !== req.partner.sub) return res.status(403).json({ error: 'This order is not assigned to you.' });

  const fields = { status };
  if (status === 'picked') fields.picked_at = Date.now();
  if (status === 'delivered') {
    fields.delivered_at = Date.now();
    if (order.payment_method === 'cod') fields.payment_status = 'paid';
  }
  const setClause = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE orders SET ${setClause} WHERE id = ?`).run(...Object.values(fields), req.params.id);

  res.json({ ok: true });
});

// ============ ADMIN ============

router.get('/', requireAdmin, (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY placed_at DESC').all(status)
    : db.prepare('SELECT * FROM orders ORDER BY placed_at DESC').all();
  res.json(rows);
});

router.patch('/:orderCode/status', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['placed', 'accepted', 'preparing', 'ready', 'picked', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  const order = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(req.params.orderCode);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const now = Date.now();
  const fields = { status };
  if (status === 'accepted') fields.accepted_at = now;
  if (status === 'ready') fields.ready_at = now;
  if (status === 'picked') fields.picked_at = now;
  if (status === 'delivered') fields.delivered_at = now;

  const setClause = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE orders SET ${setClause} WHERE order_code = ?`).run(...Object.values(fields), req.params.orderCode);

  res.json({ ok: true });
});

router.post('/manual', requireAdmin, (req, res) => {
  const { restaurant, area, rider, orderValue, commissionRate } = req.body || {};
  if (!restaurant || !area) return res.status(400).json({ error: 'restaurant and area are required.' });
  const orderCode = nextOrderCode();
  const now = Date.now();
  db.prepare(
    `INSERT INTO orders (order_code, restaurant, area, rider, order_value, commission_rate, status, placed_at)
     VALUES (?, ?, ?, ?, ?, ?, 'placed', ?)`
  ).run(orderCode, restaurant, area, rider || null, orderValue || 0, commissionRate || 12, now);
  res.status(201).json({ orderCode });
});

module.exports = router;
