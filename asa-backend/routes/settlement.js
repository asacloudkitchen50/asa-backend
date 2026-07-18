const express = require('express');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { computeWeeklySettlement } = require('../services/settlement');
const { sendEmail } = require('../services/email');
const { sendWhatsAppText } = require('../services/whatsapp');

const router = express.Router();

function formatSummaryHtml(summary) {
  const fmt = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const restaurantRows = Object.entries(summary.byRestaurant)
    .map(([name, s]) => `<tr><td>${name}</td><td>${s.orders}</td><td>${fmt(s.orderValue)}</td><td>${fmt(s.commission)}</td><td><b>${fmt(s.net)}</b></td></tr>`)
    .join('');
  const riderRows = Object.entries(summary.byRider)
    .map(([name, s]) => `<tr><td>${name}</td><td>${s.orders}</td><td><b>${fmt(s.basePay)}</b></td></tr>`)
    .join('');

  return `
    <h3>Weekly Settlement Summary — Friday to Friday</h3>
    <p>Window: ${new Date(summary.weekStart).toLocaleDateString('en-IN')} – ${new Date(summary.weekEnd).toLocaleDateString('en-IN')}</p>
    <p>Total delivered orders: ${summary.totalOrders}</p>

    <h4>Restaurants</h4>
    <table border="1" cellpadding="6" cellspacing="0">
      <tr><th>Restaurant</th><th>Orders</th><th>Order Value</th><th>Commission</th><th>Net Payable</th></tr>
      ${restaurantRows || '<tr><td colspan="5">No delivered orders this week.</td></tr>'}
    </table>

    <h4 style="margin-top:16px;">Riders</h4>
    <table border="1" cellpadding="6" cellspacing="0">
      <tr><th>Rider</th><th>Orders</th><th>Base Pay Due</th></tr>
      ${riderRows || '<tr><td colspan="3">No delivered orders this week.</td></tr>'}
    </table>
    <p style="color:#888;font-size:12px;margin-top:14px;">Note: rider pay here is base pay only (₹20/order). Add a distance_km column to the orders table to include the ₹3/km distance incentive automatically.</p>
  `;
}

// GET /api/settlement/weekly — admin: current week's computed settlement
router.get('/weekly', requireAdmin, (req, res) => {
  const summary = computeWeeklySettlement();
  res.json(summary);
});

// POST /api/settlement/send-reminder — admin (manual trigger) or scheduler (internal call):
// emails/WhatsApps the admin a summary of what's owed to whom this week.
async function sendSettlementReminder() {
  const summary = computeWeeklySettlement();
  const html = formatSummaryHtml(summary);

  const emailResult = await sendEmail({
    to: process.env.COMPANY_ADMIN_EMAIL,
    subject: `ASA Foods — Friday Settlement Reminder (${new Date().toLocaleDateString('en-IN')})`,
    html,
  });

  const totalRestaurantNet = Object.values(summary.byRestaurant).reduce((a, s) => a + s.net, 0);
  const totalRiderPay = Object.values(summary.byRider).reduce((a, s) => a + s.basePay, 0);
  const whatsappResult = await sendWhatsAppText(
    process.env.COMPANY_PHONE,
    `ASA Foods Friday settlement reminder: ₹${Math.round(totalRestaurantNet).toLocaleString('en-IN')} owed to restaurants, ` +
    `₹${Math.round(totalRiderPay).toLocaleString('en-IN')} owed to riders this week. Check your email for the full breakdown.`
  );

  db.prepare(
    'INSERT INTO settlement_log (week_start, week_end, sent_at, summary_json) VALUES (?, ?, ?, ?)'
  ).run(summary.weekStart, summary.weekEnd, Date.now(), JSON.stringify(summary));

  return { summary, emailResult, whatsappResult };
}

router.post('/send-reminder', requireAdmin, async (req, res) => {
  try {
    const result = await sendSettlementReminder();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[settlement/send-reminder]', err);
    res.status(500).json({ error: 'Failed to send settlement reminder.' });
  }
});

module.exports = { router, sendSettlementReminder };
