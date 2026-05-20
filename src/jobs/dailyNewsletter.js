const cron = require('node-cron');
const db = require('../supabase');
const { generatePremiumNewsletter, generateFreeNewsletter, generateNewsletter } = require('../newsletter');
const { sendCampaignToTag } = require('../ghl');

const PREMIUM_TAG = 'active-inner-circle-newsletter';
const FREE_TAG    = 'lead-source-inner-circle';

// ── Fetch today's approved articles, auto-approving top 5 if needed ──────────
async function getArticlesForToday() {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { rows: approved } = await db.query(
    `SELECT * FROM daily_articles
     WHERE approved = true AND created_at >= $1
     ORDER BY score DESC LIMIT 5`,
    [todayStart.toISOString()]
  );

  if (approved.length >= 1) return approved;

  console.log('No approved articles — auto-approving top 5 by score...');
  const { rows: top5 } = await db.query(
    `SELECT * FROM daily_articles
     WHERE created_at >= $1
     ORDER BY score DESC LIMIT 5`,
    [todayStart.toISOString()]
  );

  if (top5.length === 0) return [];

  const ids = top5.map(a => a.id);
  await db.query(
    `UPDATE daily_articles SET approved = true WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  console.log(`Auto-approved ${top5.length} articles`);
  return top5;
}

// ── Main daily newsletter job ─────────────────────────────────────────────────
async function runDailyNewsletter() {
  console.log('📰 Starting daily newsletter job...');

  const topics = (process.env.NEWSLETTER_TOPICS || 'dollar devaluation,BRICS,gold,inflation')
    .split(',').map(t => t.trim());

  const dateLabel = new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });

  try {
    const articles = await getArticlesForToday();

    // ── Premium campaign ───────────────────────────────────────────────────────
    let premiumResult;
    if (articles.length > 0) {
      premiumResult = await generatePremiumNewsletter(articles, topics);
    } else {
      console.log('No articles in DB — falling back to web search');
      premiumResult = await generateNewsletter(topics);
    }

    const premiumSend = await sendCampaignToTag({
      name:    `De-Dollarize Premium - ${dateLabel}`,
      tag:     PREMIUM_TAG,
      subject: premiumResult.subject,
      html:    premiumResult.html,
    });

    await db.query(
      `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier)
       VALUES ($1, $2, $3, $4, 'premium')`,
      [premiumResult.subject, premiumResult.html, premiumSend.sent, topics]
    );

    // ── Free teaser campaign ───────────────────────────────────────────────────
    if (articles.length === 0) {
      console.log('No articles for free teaser, skipping.');
    } else {
      const freeResult = await generateFreeNewsletter(articles);

      const freeSend = await sendCampaignToTag({
        name:    `De-Dollarize Free - ${dateLabel}`,
        tag:     FREE_TAG,
        subject: freeResult.subject,
        html:    freeResult.html,
      });

      await db.query(
        `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier)
         VALUES ($1, $2, $3, $4, 'free')`,
        [freeResult.subject, freeResult.html, freeSend.sent, topics]
      );
    }

    console.log('✅ Daily newsletter job complete.');
  } catch (err) {
    console.error('❌ Newsletter job failed:', err.message);
  }
}

// ── Cron wiring (called from index.js) ───────────────────────────────────────
function startCronJob() {
  const schedule = process.env.CRON_SCHEDULE || '0 8 * * *';
  console.log(`📅 Newsletter cron scheduled: ${schedule}`);
  cron.schedule(schedule, runDailyNewsletter, { timezone: 'UTC' });
}

module.exports = { startCronJob, runDailyNewsletter };
