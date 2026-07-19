const express = require('express');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function nextOrderCode() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM orders').get();
  return 'ASA' + String(1000 + row.n + 1);
}

// POST /api/orders — create an order (public: e.g. called from the customer-facing app/site)
router.post('/', (req, res) => {
  const { restaurant, area, rider, orderValue, commissionRate } = req.body || {};
  if (!restaurant || !area) {
    return res.status(400).json({ error: 'restaurant and area are required.' });
  }
  const orderCode = nextOrderCode();
  const now = Date.now();
  db.prepare(
    `INSERT INTO orders (order_code, restaurant, area, rider, order_value, commission_rate, status, placed_at)
     VALUES (?, ?, ?, ?, ?, ?, 'placed', ?)`
  ).run(orderCode, restaurant, area, rider || null, orderValue || 0, commissionRate || 12, now);
  res.status(201).json({ orderCode });
});

// GET /api/orders — admin: list all orders (optional ?status=placed|picked|delivered|cancelled)
router.get('/', requireAdmin, (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY placed_at DESC').all(status)
    : db.prepare('SELECT * FROM orders ORDER BY placed_at DESC').all();
  res.json(rows);
});

// PATCH /api/orders/:orderCode/status — admin: manually mark picked up / delivered / cancelled
router.patch('/:orderCode/status', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['placed', 'picked', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  const order = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(req.params.orderCode);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const now = Date.now();
  const fields = { status };
  if (status === 'picked') fields.picked_at = now;
  if (status === 'delivered') fields.delivered_at = now;

  const setClause = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE orders SET ${setClause} WHERE order_code = ?`).run(...Object.values(fields), req.params.orderCode);

  res.json({ ok: true });
});

module.exports = router;
