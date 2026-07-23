const express = require('express');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/restaurants — PUBLIC: list active restaurants (for the customer app to browse)
router.get('/', (req, res) => {
  const { city } = req.query;
  const rows = city
    ? db.prepare('SELECT * FROM restaurants WHERE is_active = 1 AND city = ? ORDER BY name').all(city)
    : db.prepare('SELECT * FROM restaurants WHERE is_active = 1 ORDER BY name').all();
  res.json(rows);
});

// GET /api/restaurants/all — ADMIN: list every restaurant (including inactive)
router.get('/all', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM restaurants ORDER BY created_at DESC').all());
});

// GET /api/restaurants/:id — PUBLIC: single restaurant + its menu
router.get('/:id', (req, res) => {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found.' });
  const menu = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ? AND is_available = 1 ORDER BY category, name').all(req.params.id);
  res.json({ ...restaurant, menu });
});

// POST /api/restaurants — ADMIN: add a new restaurant (e.g. while onboarding in the field)
router.post('/', requireAdmin, (req, res) => {
  const { name, businessType, city, address, phone, imageUrl, commissionRate, partnerId } = req.body || {};
  if (!name || !city) {
    return res.status(400).json({ error: 'name and city are required.' });
  }
  const info = db.prepare(
    `INSERT INTO restaurants (name, business_type, city, address, phone, image_url, commission_rate, partner_id, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(name, businessType || null, city, address || null, phone || null, imageUrl || null,
        commissionRate || 12, partnerId || null, Date.now());
  res.status(201).json({ id: info.lastInsertRowid });
});

// PATCH /api/restaurants/:id — ADMIN: update details or toggle active/inactive
router.patch('/:id', requireAdmin, (req, res) => {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found.' });

  const allowed = ['name', 'business_type', 'city', 'address', 'phone', 'image_url', 'commission_rate', 'is_active'];
  const fields = {};
  for (const key of allowed) {
    const bodyKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (req.body && req.body[bodyKey] !== undefined) fields[key] = req.body[bodyKey];
  }
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No valid fields to update.' });

  const setClause = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE restaurants SET ${setClause} WHERE id = ?`).run(...Object.values(fields), req.params.id);
  res.json({ ok: true });
});

// ---------------- Menu items ----------------

router.get('/:id/menu-items', (req, res) => {
  const rows = req.query.all === 'true'
    ? db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ? ORDER BY category, name').all(req.params.id)
    : db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ? AND is_available = 1 ORDER BY category, name').all(req.params.id);
  res.json(rows);
});

router.post('/:id/menu-items', requireAdmin, (req, res) => {
  const { name, description, price, category, isVeg, imageUrl } = req.body || {};
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'name and price are required.' });
  }
  const info = db.prepare(
    `INSERT INTO menu_items (restaurant_id, name, description, price, category, is_veg, is_available, image_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(req.params.id, name, description || null, price, category || 'Main', isVeg === false ? 0 : 1, imageUrl || null, Date.now());
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/menu-items/:id', requireAdmin, (req, res) => {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Menu item not found.' });

  const allowed = ['name', 'description', 'price', 'category', 'is_veg', 'is_available', 'image_url'];
  const fields = {};
  for (const key of allowed) {
    const bodyKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (req.body && req.body[bodyKey] !== undefined) fields[key] = req.body[bodyKey];
  }
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No valid fields to update.' });

  const setClause = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE menu_items SET ${setClause} WHERE id = ?`).run(...Object.values(fields), req.params.id);
  res.json({ ok: true });
});

module.exports = router;
