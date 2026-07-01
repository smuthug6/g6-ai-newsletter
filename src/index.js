require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

const webhookRouter = require('./routes/webhook');
const adminRouter = require('./routes/admin');
const oauthRouter = require('./routes/oauth');
const sesEventsRouter = require('./routes/sesEvents');
const unsubscribeRouter = require('./routes/unsubscribe');
const { startCronJob } = require('./jobs/dailyNewsletter');
const { runContentAggregator } = require('./jobs/contentAggregator');
const db = require('./supabase');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
// ses-events must be before express.json() — SNS sends text/plain
app.use('/ses-events', sesEventsRouter);
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/webhook/ghl', webhookRouter);
app.use('/admin', adminRouter);
app.use('/oauth', oauthRouter);
app.use('/unsubscribe', unsubscribeRouter);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 G6 AI server running on port ${PORT}`);

  // startCronJob handles all scheduling (aggregator + auto-approve + send)
  startCronJob();
});
