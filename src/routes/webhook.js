const express = require('express');
const router = express.Router();
const db = require('../supabase');

function verifyGHLSecret(req, res, next) {
  const secret = req.headers['x-ghl-secret'] || req.headers['authorization'];
  if (process.env.GHL_WEBHOOK_SECRET && secret !== process.env.GHL_WEBHOOK_SECRET) {
    console.warn('GHL webhook: unauthorized attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// POST /webhook/ghl
router.post('/', verifyGHLSecret, async (req, res) => {
  const { event, email, full_name, ghl_contact_id } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  console.log(`GHL webhook received: event=${event}, email=${email}`);

  try {
    if (event === 'subscribe') {
      await db.query(
        `INSERT INTO subscribers (email, full_name, ghl_contact_id, status, frozen_at)
         VALUES ($1, $2, $3, 'active', NULL)
         ON CONFLICT (email) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           ghl_contact_id = EXCLUDED.ghl_contact_id,
           status = 'active',
           frozen_at = NULL`,
        [email, full_name || null, ghl_contact_id || null]
      );
      console.log(`✅ Subscriber activated: ${email}`);
      return res.json({ success: true, action: 'activated', email });
    }

    if (event === 'cancel') {
      await db.query(
        `UPDATE subscribers SET status = 'frozen', frozen_at = NOW() WHERE email = $1`,
        [email]
      );
      console.log(`❄️  Subscriber frozen: ${email}`);
      return res.json({ success: true, action: 'frozen', email });
    }

    return res.status(400).json({ error: `Unknown event: ${event}` });
  } catch (err) {
    console.error('GHL webhook error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
