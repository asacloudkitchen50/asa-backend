const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { sendEmail } = require('../services/email');
const { sendWhatsAppText } = require('../services/whatsapp');
const { generateAppointmentLetter } = require('../services/pdf');

const router = express.Router();

function maskAccount(num) {
  const s = String(num || '');
  return s.length <= 4 ? s : '••••••' + s.slice(-4);
}

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000)); // 4-digit PIN
}

// POST /api/partners/register — public: rider or restaurant submits onboarding + bank details
router.post('/register', async (req, res) => {
  const {
    type, name, businessName, businessType, phone, email, city,
    aadhaar, accountHolder, bankName, accountNumber, ifsc,
  } = req.body || {};

  if (!['rider', 'restaurant'].includes(type)) {
    return res.status(400).json({ error: 'type must be "rider" or "restaurant".' });
  }
  if (!name || !phone || !accountHolder || !bankName || !accountNumber || !ifsc) {
    return res.status(400).json({ error: 'Missing required fields (name, phone, and full banking details).' });
  }

  const now = Date.now();
  const info = db.prepare(
    `INSERT INTO partners
      (type, name, business_name, business_type, phone, email, city, aadhaar,
       account_holder, bank_name, account_number, ifsc, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(type, name, businessName || null, businessType || null, phone, email || null, city || null,
        aadhaar || null, accountHolder, bankName, accountNumber, ifsc, now);

  const partnerId = info.lastInsertRowid;

  try {
    await sendEmail({
      to: process.env.COMPANY_ADMIN_EMAIL,
      subject: `New ${type} registration — ${name}`,
      html: `<p>A new <b>${type}</b> registration was submitted.</p>
             <p><b>Name:</b> ${name}<br>
             <b>Phone:</b> ${phone}<br>
             <b>City:</b> ${city || '—'}<br>
             ${businessName ? `<b>Business:</b> ${businessName} (${businessType || ''})<br>` : ''}
             </p>
             <p>Review and approve this partner in the admin panel to send their appointment letter.</p>`,
    });
  } catch (err) {
    console.error('[partners/register] admin notification email failed:', err.message);
  }

  res.status(201).json({ partnerId, status: 'pending' });
});

// GET /api/partners — admin: list partners (banking details masked unless ?reveal=true)
router.get('/', requireAdmin, (req, res) => {
  const { type, reveal } = req.query;
  const rows = type
    ? db.prepare('SELECT * FROM partners WHERE type = ? ORDER BY created_at DESC').all(type)
    : db.prepare('SELECT * FROM partners ORDER BY created_at DESC').all();

  const out = rows.map((r) => ({
    ...r,
    account_number: reveal === 'true' ? r.account_number : maskAccount(r.account_number),
  }));
  res.json(out);
});

// POST /api/partners/:id/approve — admin: approve a partner, create their dashboard login PIN,
// and (for restaurants) create their restaurant listing so it shows up for customers immediately.
router.post('/:id/approve', requireAdmin, async (req, res) => {
  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
  if (!partner) return res.status(404).json({ error: 'Partner not found.' });

  const pin = generatePin();
  db.prepare('UPDATE partners SET status = ?, access_pin = ? WHERE id = ?').run('approved', pin, partner.id);

  let emailResult = { skipped: true };
  let whatsappResult = { skipped: true };
  let restaurantId = null;

  if (partner.type === 'rider') {
    const riderId = 'ASA-R' + String(1000 + partner.id);
    const pdfBuffer = await generateAppointmentLetter({ name: partner.name, riderId, city: partner.city });

    if (partner.email) {
      emailResult = await sendEmail({
        to: partner.email,
        subject: 'Your ASA Foods Appointment Letter',
        html: `<p>Dear ${partner.name},</p><p>Congratulations! Please find your appointment letter attached (Rider ID: ${riderId}).</p>
               <p><b>Your Rider Dashboard login:</b><br>Phone: ${partner.phone}<br>PIN: <b>${pin}</b></p>
               <p>Log in at the Rider Dashboard link on our site to go online and start accepting deliveries.</p>`,
        attachments: [{ filename: 'ASA-Foods-Appointment-Letter.pdf', content: pdfBuffer }],
      });
    }
    whatsappResult = await sendWhatsAppText(
      partner.phone,
      `Congratulations ${partner.name}! Your ASA Foods rider appointment is confirmed (Rider ID: ${riderId}). ` +
      `Your Rider Dashboard login PIN is: ${pin} (use your phone number ${partner.phone} to log in). Welcome to the team!`
    );
    db.prepare('UPDATE partners SET appointment_sent_at = ? WHERE id = ?').run(Date.now(), partner.id);
  } else {
    const info = db.prepare(
      `INSERT INTO restaurants (name, business_type, city, address, phone, commission_rate, partner_id, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, 12, ?, 1, ?)`
    ).run(partner.business_name || partner.name, partner.business_type || null, partner.city || null,
          partner.city || null, partner.phone, partner.id, Date.now());
    restaurantId = info.lastInsertRowid;
    db.prepare('UPDATE partners SET restaurant_id = ? WHERE id = ?').run(restaurantId, partner.id);

    if (partner.email) {
      emailResult = await sendEmail({
        to: partner.email,
        subject: 'Your ASA Foods Restaurant Partnership is Approved',
        html: `<p>Dear ${partner.name},</p><p>Your restaurant "${partner.business_name}" is now approved and <b>live on ASA Foods</b>.</p>
               <p><b>Your Restaurant Dashboard login:</b><br>Phone: ${partner.phone}<br>PIN: <b>${pin}</b></p>
               <p>Log in to add your menu and start receiving orders.</p>`,
      });
    }
    whatsappResult = await sendWhatsAppText(
      partner.phone,
      `Congratulations ${partner.name}! "${partner.business_name}" is now approved and live on ASA Foods. ` +
      `Your Restaurant Dashboard login PIN is: ${pin} (use your phone number ${partner.phone} to log in) — add your menu to start receiving orders.`
    );
  }

  res.json({ ok: true, emailResult, whatsappResult, restaurantId, pin });
});

// POST /api/partners/login — restaurant/rider dashboard login using phone + PIN (issued on approval)
router.post('/login', (req, res) => {
  const { phone, pin } = req.body || {};
  if (!phone || !pin) return res.status(400).json({ error: 'Phone and PIN are required.' });

  const partner = db.prepare(
    "SELECT * FROM partners WHERE phone = ? AND access_pin = ? AND status = 'approved'"
  ).get(phone, pin);
  if (!partner) return res.status(401).json({ error: 'Invalid phone number or PIN.' });

  const token = jwt.sign(
    { sub: partner.id, type: partner.type, restaurantId: partner.restaurant_id || null, scope: 'partner' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({
    token,
    partner: { id: partner.id, type: partner.type, name: partner.name, restaurantId: partner.restaurant_id },
  });
});

module.exports = router;
