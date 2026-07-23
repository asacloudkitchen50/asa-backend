const cron = require('node-cron');
const { sendSettlementReminder } = require('../routes/settlement');

function startScheduler() {
  const cronExpr = process.env.SETTLEMENT_CRON || '0 9 * * 5'; // default: every Friday 9:00 AM
  const timezone = process.env.TIMEZONE || 'Asia/Kolkata';

  cron.schedule(
    cronExpr,
    async () => {
      console.log(`[scheduler] Running Friday settlement reminder at ${new Date().toISOString()}`);
      try {
        await sendSettlementReminder();
        console.log('[scheduler] Settlement reminder sent successfully.');
      } catch (err) {
        console.error('[scheduler] Settlement reminder failed:', err);
      }
    },
    { timezone }
  );

  console.log(`[scheduler] Settlement reminder scheduled: "${cronExpr}" (${timezone})`);
}

module.exports = { startScheduler };
