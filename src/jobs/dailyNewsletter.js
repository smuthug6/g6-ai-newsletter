const cron = require('node-cron');
const db = require('../supabase');
const { generatePremiumNewsletter, generateFreeNewsletter } = require('../newsletter');
const { fetchArticlesForNewsletter } = require('../wordpressFetcher');
const { runContentAggregator, autoApproveTop5 } = require('./contentAggregator');
const { getContactsByTag } = require('../ghl');
const { sendEmail, sendBulk } = require('../email');

const FREE_TAG = 'lead-source-inner-circle';

// ── Premium: Neon DB active subscribers ──────────────────────────────────────
async function getPremiumRecipients() {
  const { rows } = await db.query(`SELECT email FROM subscribers WHERE status = 'active'`);
  return rows.map(r => ({ email: r.email }));
}

// ── Free: GHL contacts with lead tag ─────────────────────────────────────────
async function getFreeRecipients() {
  const contacts = await getContactsByTag(FREE_TAG);
  return contacts
    .map(c => ({ email: (c.email || c.emailAddress || '').trim() }))
    .filter(c => c.email);
}

// ── Get today's approved articles from content queue (for free teaser) ───────
async function getApprovedQueueArticles() {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { rows } = await db.query(
    `SELECT * FROM daily_articles
     WHERE approved = true AND created_at >= $1
     ORDER BY score DESC LIMIT 5`,
    [todayStart.toISOString()]
  );
  return rows;
}

// ── Test send: premium newsletter to a single address ────────────────────────
async function runTestSend(toEmail) {
  console.log(`🧪 Test send to ${toEmail}...`);
  const articles = await fetchArticlesForNewsletter();
  if (articles.length === 0) throw new Error('No articles available for test send');
  const result = await generatePremiumNewsletter(articles);
  await sendEmail({ to: toEmail, subject: `[TEST] ${result.subject}`, html: result.html });
  console.log(`✅ Test email sent to ${toEmail}`);
  return result;
}

// ── 7:00am UTC: fetch Dream 100 + run Grok + save to queue ───────────────────
async function runAggregatorJob() {
  console.log('⏰ 7:00am — Running content aggregator + Grok ranking...');
  try {
    await runContentAggregator();
    console.log('✅ Content queue updated with Grok top 10');
  } catch (err) {
    console.error('❌ Content aggregator failed:', err.message);
  }
}

// ── 7:55am UTC: auto-approve top 5 if boss hasn't approved yet ───────────────
async function runAutoApproveJob() {
  console.log('⏰ 7:55am — Auto-approving top 5 if not manually approved...');
  try {
    await autoApproveTop5();
  } catch (err) {
    console.error('❌ Auto-approve failed:', err.message);
  }
}

// ── 8:00am UTC: send both newsletters ────────────────────────────────────────
async function runDailyNewsletter() {
  console.log('📰 Starting daily newsletter job...');

  try {
    // ── PREMIUM: dedollarizenews.com articles with real WP images ─────────────
    const wpArticles = await fetchArticlesForNewsletter();
    if (wpArticles.length === 0) {
      console.error('❌ No WP articles found — premium newsletter cancelled');
    } else {
      console.log(`📄 ${wpArticles.length} articles from dedollarizenews.com`);
      const premiumResult = await generatePremiumNewsletter(wpArticles);

      const premiumContacts = await getPremiumRecipients();
      console.log(`📧 Premium recipients: ${premiumContacts.length}`);
      if (premiumContacts.length === 0) console.warn('⚠️  No active subscribers in DB');

      const premiumSend = await sendBulk(premiumContacts, premiumResult.subject, premiumResult.html);
      console.log(`✅ Premium sent — sent: ${premiumSend.sent}, failed: ${premiumSend.failed}${premiumSend.firstError ? `, error: ${premiumSend.firstError}` : ''}`);

      await db.query(
        `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier)
         VALUES ($1, $2, $3, $4, 'premium')`,
        [premiumResult.subject, premiumResult.html, premiumSend.sent, ['dedollarizenews.com']]
      );
    }

    // ── FREE TEASER: approved content queue (Dream 100 + Grok ranked) ─────────
    const queueArticles = await getApprovedQueueArticles();
    if (queueArticles.length === 0) {
      console.warn('⚠️  No approved articles in queue — skipping free teaser');
    } else {
      console.log(`📄 ${queueArticles.length} approved articles for free teaser`);
      const freeResult = await generateFreeNewsletter(queueArticles);

      let freeContacts = [];
      try {
        freeContacts = await getFreeRecipients();
      } catch (err) {
        console.warn(`⚠️  GHL contacts failed (${err.message}) — skipping free send`);
      }
      console.log(`📧 Free recipients: ${freeContacts.length}`);

      const freeSend = await sendBulk(freeContacts, freeResult.subject, freeResult.html);
      console.log(`✅ Free sent — sent: ${freeSend.sent}, failed: ${freeSend.failed}`);

      await db.query(
        `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier)
         VALUES ($1, $2, $3, $4, 'free')`,
        [freeResult.subject, freeResult.html, freeSend.sent, ['dream100']]
      );
    }

    console.log('✅ Daily newsletter job complete.');
  } catch (err) {
    console.error('❌ Newsletter job failed:', err.message, err.stack);
  }
}

// ── Cron wiring ───────────────────────────────────────────────────────────────
function startCronJob() {
  // 7:00am UTC — fetch Dream 100, run Grok, save top 10 to queue
  cron.schedule('0 7 * * *', runAggregatorJob, { timezone: 'UTC' });
  console.log('📅 Cron: content aggregator at 7:00am UTC');

  // 7:55am UTC — auto-approve top 5 if not manually approved
  cron.schedule('55 7 * * *', runAutoApproveJob, { timezone: 'UTC' });
  console.log('📅 Cron: auto-approve at 7:55am UTC');

  // 8:00am UTC — send both newsletters
  const schedule = process.env.CRON_SCHEDULE || '0 8 * * *';
  cron.schedule(schedule, runDailyNewsletter, { timezone: 'UTC' });
  console.log(`📅 Cron: newsletter send at ${schedule} UTC`);
}

module.exports = { startCronJob, runDailyNewsletter, runTestSend, runAggregatorJob, runAutoApproveJob };
