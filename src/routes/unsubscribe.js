const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../supabase');
const { removeTagsFromContact, lookupContactByEmail } = require('../ghl');

function verifySignature(email, sig) {
  const expected = crypto
    .createHmac('sha256', process.env.GHL_WEBHOOK_SECRET || 'fallback')
    .update(email.toLowerCase())
    .digest('hex')
    .slice(0, 16);
  return expected === sig;
}

router.get('/', async (req, res) => {
  const { email, sig } = req.query;

  if (!email || !sig || !verifySignature(email, sig)) {
    return res.status(400).send(page('Invalid unsubscribe link.', false));
  }

  try {
    // 1. Freeze in Neon DB if premium subscriber + detect tier
    const { rowCount } = await db.query(
      `UPDATE subscribers SET status = 'frozen', frozen_at = NOW() WHERE email = $1`,
      [email]
    );
    const tier = rowCount > 0 ? 'premium' : 'free';

    // 2. Remove both tags from GHL
    try {
      const contactId = await lookupContactByEmail(email);
      if (contactId) {
        await removeTagsFromContact(contactId, ['ddn-free', 'ddn-inner-circle']);
        console.log(`✅ Unsubscribed ${email} — GHL tags removed, DB frozen`);
      }
    } catch (ghlErr) {
      console.warn(`GHL tag removal failed for ${email}: ${ghlErr.message}`);
    }

    // 3. Log unsubscribe event for analytics
    await db.query(
      `INSERT INTO email_events (email, event_type, tier, event_time) VALUES ($1, 'unsubscribe', $2, NOW())`,
      [email, tier]
    ).catch(() => {});

    res.send(page('You have been unsubscribed.', true));
  } catch (err) {
    console.error('Unsubscribe error:', err.message);
    res.status(500).send(page('Something went wrong. Please try again.', false));
  }
});

function page(message, success) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>De-Dollarize News</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .box { background: #fff; border-radius: 10px; padding: 48px 40px; text-align: center; max-width: 420px; width: 90%; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .icon { font-size: 40px; margin-bottom: 20px; }
    h1 { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 12px; }
    p { font-size: 14px; color: #666; line-height: 1.6; }
    a { color: #cc0000; text-decoration: none; font-size: 13px; display: inline-block; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">${success ? '✅' : '❌'}</div>
    <h1>${message}</h1>
    <p>${success ? 'You will no longer receive emails from De-Dollarize News.' : 'Please contact support if the issue persists.'}</p>
    <a href="https://dedollarizenews.com">← Back to De-Dollarize News</a>
  </div>
</body>
</html>`;
}

module.exports = router;
