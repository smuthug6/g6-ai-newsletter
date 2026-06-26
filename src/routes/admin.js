const express = require('express');
const router = express.Router();
const db = require('../supabase');
const { generatePremiumNewsletter, generateFreeNewsletter, generateNewsletter } = require('../newsletter');
const { runDailyNewsletter, runPremiumNewsletter, runFreeNewsletter, runTestSend, runAggregatorJob } = require('../jobs/dailyNewsletter');
const { testSesConnection } = require('../email');
const { fetchArticlesForNewsletter } = require('../wordpressFetcher');

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

// ── Preview Premium — live dedollarizenews.com WP articles ────────────────────
router.post('/preview/premium', adminAuth, async (req, res) => {
  try {
    const articles = await fetchArticlesForNewsletter();
    if (articles.length === 0) return res.status(404).json({ error: 'No articles found on dedollarizenews.com today.' });
    const result = await generatePremiumNewsletter(articles);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Preview Free Teaser — approved content queue (Dream 100 + Grok) ───────────
router.post('/preview/free', adminAuth, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { rows } = await db.query(
      `SELECT * FROM daily_articles WHERE approved = true AND created_at >= $1 ORDER BY score DESC LIMIT 3`,
      [todayStart.toISOString()]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No approved articles in content queue. Run the aggregator first, then approve articles.' });
    const result = await generateFreeNewsletter(rows);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Today's dedollarizenews.com articles (read-only, for dashboard display) ───
router.get('/articles/premium-preview', adminAuth, async (req, res) => {
  try {
    const articles = await fetchArticlesForNewsletter();
    res.json({ articles });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GHL contact counts by tag ─────────────────────────────────────────────────
router.get('/ghl-contacts', adminAuth, async (req, res) => {
  const axios = require('axios');
  const GHL_BASE = 'https://services.leadconnectorhq.com';
  const headers = { Authorization: `Bearer ${process.env.GHL_API_KEY}`, Version: '2021-04-15' };
  const locationId = process.env.GHL_LOCATION_ID;

  async function fetchTag(tag) {
    const contacts = [];
    let page = 1;
    while (true) {
      const r = await axios.get(`${GHL_BASE}/contacts/`, {
        params: { locationId, tag, limit: 100, page },
        headers,
      });
      const batch = r.data?.contacts || [];
      contacts.push(...batch);
      if (batch.length < 100) break;
      page++;
    }
    return contacts;
  }

  try {
    const contacts = await fetchTag('ddn-free-test');
    const seen = new Set();
    const unique = contacts.filter(c => {
      const email = c.email || c.emailAddress || '';
      if (!email || seen.has(email)) return false;
      seen.add(email);
      return true;
    });
    res.json({
      tag: 'ddn-free-test',
      total: unique.length,
      sample: unique.slice(0, 5).map(c => c.email || c.emailAddress),
    });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

// ── Manually trigger content aggregator (Dream 100 + Grok) ───────────────────
router.post('/run-aggregator', adminAuth, async (req, res) => {
  res.json({ message: 'Content aggregator started — check queue in ~30 seconds' });
  runAggregatorJob().catch(err => console.error('Aggregator error:', err.message));
});

// ── Test SES connectivity ─────────────────────────────────────────────────────
router.post('/test-ses', adminAuth, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'to email is required' });
  const result = await testSesConnection(to);
  if (result.ok) {
    res.json({ success: true, message: `SES test email sent to ${to}` });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

// ── Send both now ─────────────────────────────────────────────────────────────
router.post('/send-now', adminAuth, async (req, res) => {
  res.json({ message: 'Newsletter send started in background' });
  runDailyNewsletter().catch(err => console.error('❌ send-now background job crashed:', err.message));
});

// ── Send premium only ─────────────────────────────────────────────────────────
router.post('/send-premium', adminAuth, async (req, res) => {
  res.json({ message: 'Premium newsletter send started in background' });
  runPremiumNewsletter().catch(err => console.error('❌ send-premium crashed:', err.message));
});

// ── Send free teaser only ─────────────────────────────────────────────────────
router.post('/send-free', adminAuth, async (req, res) => {
  res.json({ message: 'Free teaser send started in background' });
  runFreeNewsletter().catch(err => console.error('❌ send-free crashed:', err.message));
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

// ── Analytics: per-newsletter open/click/bounce summary ──────────────────────
router.get('/analytics', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        n.id, n.subject, n.sent_to, n.sent_at, n.tier, n.send_id,
        COUNT(DISTINCT CASE WHEN e.event_type = 'open'      THEN e.email END) AS opens,
        COUNT(DISTINCT CASE WHEN e.event_type = 'click'     THEN e.email END) AS clicks,
        COUNT(DISTINCT CASE WHEN e.event_type = 'bounce'    THEN e.email END) AS bounces,
        COUNT(DISTINCT CASE WHEN e.event_type = 'complaint' THEN e.email END) AS complaints
      FROM newsletters n
      LEFT JOIN email_events e ON (
        (n.send_id IS NOT NULL AND e.send_id = n.send_id)
        OR
        (n.send_id IS NULL AND e.tier = n.tier
          AND DATE(e.event_time AT TIME ZONE 'UTC') = DATE(n.sent_at AT TIME ZONE 'UTC'))
      )
      GROUP BY n.id
      ORDER BY n.sent_at DESC
      LIMIT 20
    `);
    res.json({ newsletters: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics drill-down: who opened/clicked ─────────────────────────────────
router.get('/analytics/events', adminAuth, async (req, res) => {
  const { send_id, tier, date, event_type } = req.query;
  if (!event_type) return res.status(400).json({ error: 'event_type required' });
  try {
    let rows;
    if (send_id) {
      ({ rows } = await db.query(`
        SELECT email, event_type, link, event_time
        FROM email_events
        WHERE event_type = $1 AND send_id = $2
        ORDER BY event_time ASC
      `, [event_type, send_id]));
    } else {
      ({ rows } = await db.query(`
        SELECT email, event_type, link, event_time
        FROM email_events
        WHERE event_type = $1 AND tier = $2
          AND DATE(event_time AT TIME ZONE 'UTC') = $3::date
        ORDER BY event_time ASC
      `, [event_type, tier, date]));
    }
    res.json({ events: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
