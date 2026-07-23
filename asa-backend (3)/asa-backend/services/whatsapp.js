const axios = require('axios');

/**
 * Send a WhatsApp text message via Meta's WhatsApp Cloud API.
 * Requires a Meta developer app with WhatsApp product enabled:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
 *
 * @param {string} toPhone - recipient phone in international format, e.g. "919876543210" (no +, no spaces)
 * @param {string} message - plain text message body
 */
async function sendWhatsAppText(toPhone, message) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v20.0';

  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp] Not configured — skipping send. Set WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN in .env.');
    return { skipped: true };
  }

  const cleanPhone = String(toPhone).replace(/[^0-9]/g, '');
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const response = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: { body: message },
    },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
  return response.data;
}

module.exports = { sendWhatsAppText };
