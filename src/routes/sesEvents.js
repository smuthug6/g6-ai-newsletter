const express = require('express');
const router = express.Router();
const db = require('../supabase');

// SNS sends text/plain — parse raw body ourselves
router.post('/', express.text({ type: '*/*' }), async (req, res) => {
  res.sendStatus(200); // always ack immediately

  let msg;
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    msg = JSON.parse(raw);
  } catch (e) {
    return;
  }

  // SNS subscription confirmation — auto-confirm
  if (msg.Type === 'SubscriptionConfirmation') {
    try {
      await fetch(msg.SubscribeURL);
      console.log('✅ SNS subscription confirmed');
    } catch (e) {
      console.error('SNS confirm failed:', e.message);
    }
    return;
  }

  if (msg.Type !== 'Notification') return;

  let event;
  try {
    event = JSON.parse(msg.Message);
  } catch (e) {
    return;
  }

  const eventType = (event.eventType || '').toLowerCase();
  if (!eventType || eventType === 'send') return; // skip raw send events

  const email = event.mail?.destination?.[0] || null;
  const link = event.click?.link || null;
  const tier = event.mail?.tags?.tier?.[0] || null;
  const eventTime = event.mail?.timestamp || new Date().toISOString();

  try {
    await db.query(
      `INSERT INTO email_events (email, event_type, link, tier, event_time)
       VALUES ($1, $2, $3, $4, $5)`,
      [email, eventType, link, tier, eventTime]
    );
  } catch (e) {
    console.error('Failed to save SES event:', e.message);
  }
});

module.exports = router;
