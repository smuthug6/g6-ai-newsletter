const express = require('express');
const router = express.Router();
const db = require('../supabase');
const { generatePremiumNewsletter, generateFreeNewsletter, generateNewsletter } = require('../newsletter');
const { runDailyNewsletter, runTestSend } = require('../jobs/dailyNewsletter');

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== process.env.GHL_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [activeRes, frozenRes, newsletterRes] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM subscribers WHERE status = 'active'`),
      db.query(`SELECT COUNT(*) FROM subscribers WHERE status = 'frozen'`),
      db.query(`SELECT id, subject, sent_to, sent_at, tier FROM newsletters ORDER BY sent_at DESC LIMIT 5`),
    ]);
    res.json({
      active: parseInt(activeRes.rows[0].count, 10),
      frozen: parseInt(frozenRes.rows[0].count, 10),
      recentNewsletters: newsletterRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Subscribers ───────────────────────────────────────────────────────────────
router.get('/subscribers', adminAuth, async (req, res) => {
  const { status = 'active', page = 1 } = req.query;
  const limit = 50;
  const offset = (page - 1) * limit;
  try {
    const result = await db.query(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM subscribers WHERE status = $1
       ORDER BY subscribed_at DESC LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
    const subscribers = result.rows.map(({ total_count, ...row }) => row);
    res.json({ subscribers, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/subscriber/:email/freeze', adminAuth, async (req, res) => {
  try {
    await db.query(`UPDATE subscribers SET status = 'frozen', frozen_at = NOW() WHERE email = $1`, [req.params.email]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/subscriber/:email/activate', adminAuth, async (req, res) => {
  try {
    await db.query(`UPDATE subscribers SET status = 'active', frozen_at = NULL WHERE email = $1`, [req.params.email]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Articles: today's content queue ──────────────────────────────────────────
router.get('/articles/today', adminAuth, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { rows } = await db.query(
      `SELECT * FROM daily_articles WHERE created_at >= $1 ORDER BY score DESC LIMIT 10`,
      [todayStart.toISOString()]
    );
    res.json({ articles: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/articles/:id/approve', adminAuth, async (req, res) => {
  try {
    await db.query(`UPDATE daily_articles SET approved = true WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/articles/:id/remove', adminAuth, async (req, res) => {
  try {
    await db.query(`DELETE FROM daily_articles WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/articles/reorder', adminAuth, async (req, res) => {
  // Accepts { order: ['uuid1','uuid2',...] } — updates score so rank reflects order
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of IDs' });
  try {
    for (let i = 0; i < order.length; i++) {
      await db.query(
        `UPDATE daily_articles SET score = $1 WHERE id = $2`,
        [1000 - i * 10, order[i]]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/articles/custom', adminAuth, async (req, res) => {
  const { title, url } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO daily_articles (title, url, source, score, manually_added, approved)
       VALUES ($1, $2, 'manual', 999, true, true) RETURNING *`,
      [title, url || null]
    );
    res.json({ article: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/approve-top5', adminAuth, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { rows } = await db.query(
      `SELECT id FROM daily_articles WHERE created_at >= $1 ORDER BY score DESC LIMIT 5`,
      [todayStart.toISOString()]
    );
    const ids = rows.map(r => r.id);
    if (ids.length === 0) return res.status(404).json({ error: 'No articles found for today' });
    await db.query(`UPDATE daily_articles SET approved = true WHERE id = ANY($1::uuid[])`, [ids]);
    res.json({ success: true, approved: ids.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Previews ─────────────────────────────────────────────────────────────────
router.post('/preview', adminAuth, async (req, res) => {
  try {
    const topics = (process.env.NEWSLETTER_TOPICS || 'dollar devaluation,BRICS,gold,inflation')
      .split(',').map(t => t.trim());
    const result = await generateNewsletter(topics);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/preview/premium', adminAuth, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { rows } = await db.query(
      `SELECT * FROM daily_articles WHERE approved = true AND created_at >= $1 ORDER BY score DESC LIMIT 5`,
      [todayStart.toISOString()]
    );
    const topics = (process.env.NEWSLETTER_TOPICS || 'dollar devaluation,BRICS,gold,inflation')
      .split(',').map(t => t.trim());

    let result;
    if (rows.length > 0) {
      result = await generatePremiumNewsletter(rows, topics);
    } else {
      result = await generateNewsletter(topics);
    }
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/preview/free', adminAuth, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { rows } = await db.query(
      `SELECT * FROM daily_articles WHERE approved = true AND created_at >= $1 ORDER BY score DESC LIMIT 5`,
      [todayStart.toISOString()]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No approved articles for today. Approve articles first.' });
    const result = await generateFreeNewsletter(rows);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Send now ─────────────────────────────────────────────────────────────────
router.post('/send-now', adminAuth, async (req, res) => {
  res.json({ message: 'Newsletter send started in background' });
  runDailyNewsletter();
});

// ── Test send — single email to confirm SES is working ───────────────────────
router.post('/test-send', adminAuth, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'to email is required' });
  try {
    await runTestSend(to);
    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
