require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const webhookRouter = require('./routes/webhook');
const adminRouter = require('./routes/admin');
const { startCronJob } = require('./jobs/dailyNewsletter');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/webhook/ghl', webhookRouter);
app.use('/admin', adminRouter);

// Serve admin dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Health check (Render uses this to verify the service is up)
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 G6 AI server running on port ${PORT}`);
  startCronJob();
});
