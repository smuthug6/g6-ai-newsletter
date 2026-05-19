const cron = require('node-cron');
const db = require('../supabase');
const { generatePremiumNewsletter, generateFreeNewsletter, generateNewsletter } = require('../newsletter');
const { sendNewsletterToAll, sendNewsletterToTag } = require('../ghl');

// ── Fetch today's approved articles, auto-approving top 5 if needed ──────────
async function getArticlesForToday() {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Try approved articles first
  const { rows: approved } = await db.query(
    `SELECT * FROM daily_articles
     WHERE approved = true AND created_at >= $1
     ORDER BY score DESC LIMIT 5`,
    [todayStart.toISOString()]
  );

  if (approved.length >= 1) return approved;

  // Auto-approve top 5 by score
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

  try {
    // ── Get articles ───────────────────────────────────────────────────────────
    const articles = await getArticlesForToday();

    // ── Premium send ───────────────────────────────────────────────────────────
    const { rows: premiumSubs } = await db.query(
      `SELECT id, email, full_name, ghl_contact_id FROM subscribers WHERE status = 'active'`
    );

    if (premiumSubs.length === 0) {
      console.log('No active premium subscribers, skipping premium send.');
    } else {
      console.log(`Sending premium newsletter to ${premiumSubs.length} subscribers`);

      let premiumResult;
      if (articles.length > 0) {
        premiumResult = await generatePremiumNewsletter(articles, topics);
      } else {
        console.log('No articles in DB — falling back to web search');
        premiumResult = await generateNewsletter(topics);
      }

      const { sent: premiumSent, failed: premiumFailed } = await sendNewsletterToAll(
        premiumSubs, premiumResult.subject, premiumResult.html
      );

      await db.query(
        `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier)
         VALUES ($1, $2, $3, $4, 'premium')`,
        [premiumResult.subject, premiumResult.html, premiumSent, topics]
      );

      console.log(`✅ Premium sent: ${premiumSent}, failed: ${premiumFailed}`);
    }

    // ── Free teaser send ───────────────────────────────────────────────────────
    const freeTag = process.env.FREE_LEADS_TAG;
    if (!freeTag) {
      console.log('FREE_LEADS_TAG not set, skipping free send.');
    } else if (articles.length === 0) {
      console.log('No articles for free teaser, skipping.');
    } else {
      console.log(`Sending free teaser to GHL tag: ${freeTag}`);

      const freeResult = await generateFreeNewsletter(articles);
      const { sent: freeSent, failed: freeFailed } = await sendNewsletterToTag(
        freeTag, freeResult.subject, freeResult.html
      );

      await db.query(
        `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier)
         VALUES ($1, $2, $3, $4, 'free')`,
        [freeResult.subject, freeResult.html, freeSent, topics]
      );

      console.log(`✅ Free teaser sent: ${freeSent}, failed: ${freeFailed}`);
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
