require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

const webhookRouter = require('./routes/webhook');
const adminRouter = require('./routes/admin');
const oauthRouter = require('./routes/oauth');
const { startCronJob } = require('./jobs/dailyNewsletter');
const { runContentAggregator } = require('./jobs/contentAggregator');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/webhook/ghl', webhookRouter);
app.use('/admin', adminRouter);
app.use('/oauth', oauthRouter);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 G6 AI server running on port ${PORT}`);

  // 7:00am UTC — fetch and score today's articles from all RSS feeds
  cron.schedule('0 7 * * *', () => {
    console.log('⏰ 7am UTC — running content aggregator');
    runContentAggregator().catch(e => console.error('Aggregator error:', e.message));
  }, { timezone: 'UTC' });

  // 8:00am UTC — generate and send newsletters (auto-approves top 5 if not manually approved)
  startCronJob();
});
