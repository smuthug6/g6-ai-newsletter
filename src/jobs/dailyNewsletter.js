const cron = require('node-cron');
const { randomUUID } = require('crypto');
const db = require('../supabase');
const { generatePremiumNewsletter, generateFreeNewsletter } = require('../newsletter');
const { fetchLatestInnerCircleArticle } = require('../wordpressFetcher');
const { runContentAggregator, autoApproveTop5 } = require('./contentAggregator');
const { getContactsByTag } = require('../ghl');
const { sendEmail, sendBulk } = require('../email');

// ── Premium: Neon DB active subscribers ──────────────────────────────────────
async function getPremiumRecipients() {
  const { rows } = await db.query(`SELECT email FROM subscribers WHERE status = 'active'`);
  return rows.map(r => ({ email: r.email }));
}

// ── Free: GHL contacts with ddn-free-test tag ────────────────────────────────
async function getFreeRecipients() {
  const contacts = await getContactsByTag('ddn-free');
  const seen = new Set();
  return contacts
    .map(c => ({ email: (c.email || c.emailAddress || '').trim() }))
    .filter(c => {
      if (!c.email || seen.has(c.email)) return false;
      seen.add(c.email);
      return true;
    });
}

// ── Get today's approved articles from content queue (for free teaser) ───────
async function getApprovedQueueArticles() {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { rows } = await db.query(
    `SELECT * FROM daily_articles
     WHERE approved = true AND created_at >= $1
     ORDER BY score DESC LIMIT 3`,
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
    // Wake up Neon DB before aggregator needs it
    await db.query('SELECT 1').catch(() => {});
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

// ── Send premium only ─────────────────────────────────────────────────────────
async function runPremiumNewsletter() {
  console.log('📰 Sending premium newsletter only...');
  try {
    const article = await fetchLatestInnerCircleArticle();
    const premiumResult = await generatePremiumNewsletter(article);
    const premiumContacts = await getPremiumRecipients();
    console.log(`📧 Premium recipients: ${premiumContacts.length}`);
    const premiumSendId = randomUUID();
    const premiumSend = await sendBulk(premiumContacts, premiumResult.subject, premiumResult.html, { tier: 'premium', sendId: premiumSendId });
    console.log(`✅ Premium sent — sent: ${premiumSend.sent}, failed: ${premiumSend.failed}`);
    await db.query(
      `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier, send_id) VALUES ($1, $2, $3, $4, 'premium', $5)`,
      [premiumResult.subject, premiumResult.html, premiumSend.sent, ['inner-circle'], premiumSendId]
    );
    return premiumSend;
  } catch (err) {
    console.error('❌ Premium send failed:', err.message);
    throw err;
  }
}

// ── Send free teaser only ─────────────────────────────────────────────────────
async function runFreeNewsletter() {
  console.log('📰 Sending free teaser only...');
  try {
    const queueArticles = await getApprovedQueueArticles();
    if (queueArticles.length === 0) throw new Error('No approved articles in queue — approve articles first');
    const freeResult = await generateFreeNewsletter(queueArticles);
    let freeContacts = [];
    try { freeContacts = await getFreeRecipients(); } catch (err) { console.warn(`⚠️ GHL failed: ${err.message}`); }
    console.log(`📧 Free recipients: ${freeContacts.length}`);
    const freeSendId = randomUUID();
    const freeSend = await sendBulk(freeContacts, freeResult.subject, freeResult.html, { tier: 'free', sendId: freeSendId });
    console.log(`✅ Free sent — sent: ${freeSend.sent}, failed: ${freeSend.failed}`);
    await db.query(
      `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier, send_id) VALUES ($1, $2, $3, $4, 'free', $5)`,
      [freeResult.subject, freeResult.html, freeSend.sent, ['dream100'], freeSendId]
    );
    return freeSend;
  } catch (err) {
    console.error('❌ Free send failed:', err.message);
    throw err;
  }
}

// ── 8:00am UTC: send both newsletters ────────────────────────────────────────
async function runDailyNewsletter() {
  console.log('📰 Starting daily newsletter job...');

  try {
    // ── PREMIUM: latest Inner Circle article ──────────────────────────────────
    try {
      const article = await fetchLatestInnerCircleArticle();
      console.log(`📄 Inner Circle: "${article.title}" by ${article.author}`);
      const premiumResult = await generatePremiumNewsletter(article);
      const premiumContacts = await getPremiumRecipients();
      console.log(`📧 Premium recipients: ${premiumContacts.length}`);
      if (premiumContacts.length === 0) console.warn('⚠️  No active subscribers in DB');
      const premiumSendId = randomUUID();
      const premiumSend = await sendBulk(premiumContacts, premiumResult.subject, premiumResult.html, { tier: 'premium', sendId: premiumSendId });
      console.log(`✅ Premium sent — sent: ${premiumSend.sent}, failed: ${premiumSend.failed}${premiumSend.firstError ? `, error: ${premiumSend.firstError}` : ''}`);
      await db.query(
        `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier, send_id) VALUES ($1, $2, $3, $4, 'premium', $5)`,
        [premiumResult.subject, premiumResult.html, premiumSend.sent, ['inner-circle'], premiumSendId]
      );
    } catch (err) {
      console.error('❌ Premium newsletter failed:', err.message);
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

      const freeSendId = randomUUID();
      const freeSend = await sendBulk(freeContacts, freeResult.subject, freeResult.html, { tier: 'free', sendId: freeSendId });
      console.log(`✅ Free sent — sent: ${freeSend.sent}, failed: ${freeSend.failed}`);

      await db.query(
        `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier, send_id)
         VALUES ($1, $2, $3, $4, 'free', $5)`,
        [freeResult.subject, freeResult.html, freeSend.sent, ['dream100'], freeSendId]
      );
    }

    console.log('✅ Daily newsletter job complete.');
  } catch (err) {
    console.error('❌ Newsletter job failed:', err.message, err.stack);
  }
}

// ── Cron wiring (all times Eastern) ──────────────────────────────────────────
function startCronJob() {
  // 11:00am UTC (7:00am EDT) — fetch Dream 100, run Grok, save top 10 to queue
  cron.schedule('0 11 * * *', runAggregatorJob, { timezone: 'UTC' });
  console.log('📅 Cron: content aggregator at 7:00am EDT (11:00am UTC)');

  // 11:55am UTC (7:55am EDT) — auto-approve top 5 if not manually approved
  cron.schedule('55 11 * * *', runAutoApproveJob, { timezone: 'UTC' });
  console.log('📅 Cron: auto-approve at 7:55am EDT (11:55am UTC)');

  // 12:00pm UTC (8:00am EDT) — send both newsletters
  cron.schedule('0 12 * * *', runDailyNewsletter, { timezone: 'UTC' });
  console.log('📅 Cron: newsletter send at 8:00am EDT (12:00pm UTC)');
}

module.exports = { startCronJob, runDailyNewsletter, runPremiumNewsletter, runFreeNewsletter, runTestSend, runAggregatorJob, runAutoApproveJob };
