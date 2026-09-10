const express = require('express');
const router = express.Router();
const db = require('../supabase');
const { lookupContactByEmail, removeTagsFromContact, addTagToContact } = require('../ghl');

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
  const sendId = event.mail?.tags?.send_id?.[0] || null;
  const eventTime = event.mail?.timestamp || new Date().toISOString();
  const bounceType = eventType === 'bounce' ? (event.bounce?.bounceType || null) : null;

  try {
    await db.query(
      `INSERT INTO email_events (email, event_type, link, tier, send_id, event_time, bounce_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [email, eventType, link, tier, sendId, eventTime, bounceType]
    );
  } catch (e) {
    console.error('Failed to save SES event:', e.message);
  }

  // Real-time GHL cleanup for complaints and hard bounces (free tier only)
  const isComplaint = eventType === 'complaint';
  const isHardBounce = eventType === 'bounce' && bounceType === 'Permanent';

  if (email && tier === 'free' && (isComplaint || isHardBounce)) {
    const markerTag = isComplaint ? 'complained-ddn-free' : 'bounced-ddn-free';
    const label = isComplaint ? '🚫 Complaint' : '🗑️ Hard bounce';
    try {
      const contactId = await lookupContactByEmail(email);
      if (contactId) {
        await removeTagsFromContact(contactId, ['ddn-free']);
        await addTagToContact(contactId, markerTag);
        console.log(`${label}: removed ddn-free, added ${markerTag} — ${email}`);
      }
    } catch (e) {
      console.error(`${label}: GHL cleanup failed for ${email}:`, e.message);
    }
  }

  // Tag clickers in GHL
  if (email && tier === 'free' && eventType === 'click') {
    try {
      const contactId = await lookupContactByEmail(email);
      if (contactId) {
        await addTagToContact(contactId, 'clicked-ddn-free');
        console.log(`👆 Click: added clicked-ddn-free — ${email}`);
      }
    } catch (e) {
      console.error(`Click: GHL tag failed for ${email}:`, e.message);
    }
  }
});

module.exports = router;
