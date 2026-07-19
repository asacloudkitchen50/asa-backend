const express = require('express');
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

  // Notify admin by email that a new partner needs review (banking details are NOT included in this email body)
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

// POST /api/partners/:id/approve — admin: approve a rider and email/WhatsApp their appointment letter
router.post('/:id/approve', requireAdmin, async (req, res) => {
  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
  if (!partner) return res.status(404).json({ error: 'Partner not found.' });

  db.prepare('UPDATE partners SET status = ? WHERE id = ?').run('approved', partner.id);

  let emailResult = { skipped: true };
  let whatsappResult = { skipped: true };

  if (partner.type === 'rider') {
    const riderId = 'ASA-R' + String(1000 + partner.id);
    const pdfBuffer = await generateAppointmentLetter({ name: partner.name, riderId, city: partner.city });

    if (partner.email) {
      emailResult = await sendEmail({
        to: partner.email,
        subject: 'Your ASA Foods Appointment Letter',
        html: `<p>Dear ${partner.name},</p><p>Congratulations! Please find your appointment letter attached (Rider ID: ${riderId}).</p>`,
        attachments: [{ filename: 'ASA-Foods-Appointment-Letter.pdf', content: pdfBuffer }],
      });
    }
    whatsappResult = await sendWhatsAppText(
      partner.phone,
      `Congratulations ${partner.name}! Your ASA Foods rider appointment is confirmed (Rider ID: ${riderId}). ` +
      `Your appointment letter has been emailed to you. Welcome to the team!`
    );
    db.prepare('UPDATE partners SET appointment_sent_at = ? WHERE id = ?').run(Date.now(), partner.id);
  } else {
    if (partner.email) {
      emailResult = await sendEmail({
        to: partner.email,
        subject: 'Your ASA Foods Restaurant Partnership is Approved',
        html: `<p>Dear ${partner.name},</p><p>Your restaurant "${partner.business_name}" is now approved as an ASA Foods partner. Our onboarding team will be in touch shortly.</p>`,
      });
    }
    whatsappResult = await sendWhatsAppText(
      partner.phone,
      `Congratulations ${partner.name}! "${partner.business_name}" is now approved as an ASA Foods restaurant partner.`
    );
  }

  res.json({ ok: true, emailResult, whatsappResult });
});

module.exports = router;
