const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

/**
 * Send an email.
 * @param {{to: string, subject: string, html: string, attachments?: Array}} opts
 */
async function sendEmail({ to, subject, html, attachments }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[email] SMTP not configured — skipping send. Set SMTP_USER / SMTP_PASS in .env.');
    return { skipped: true };
  }
  const t = getTransporter();
  const info = await t.sendMail({
    from: `"${process.env.COMPANY_NAME || 'ASA Foods'}" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    attachments,
  });
  return info;
}

module.exports = { sendEmail };
