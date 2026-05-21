const cron = require('node-cron');
const db = require('../supabase');
const { generatePremiumNewsletter, generateFreeNewsletter, generateNewsletter } = require('../newsletter');
const { fetchArticlesForNewsletter } = require('../wordpressFetcher');
const { getContactsByTag } = require('../ghl');
const { sendEmail, sendBulk } = require('../email');

const FREE_TAG = 'lead-source-inner-circle';

// ── Premium: Neon DB active subscribers (source of truth for paid) ───────────
async function getPremiumRecipients() {
  const { rows } = await db.query(
    `SELECT email FROM subscribers WHERE status = 'active'`
  );
  return rows.map(r => ({ email: r.email }));
}

// ── Free: GHL contacts with lead tag ─────────────────────────────────────────
async function getFreeRecipients() {
  const contacts = await getContactsByTag(FREE_TAG);
  return contacts
    .map(c => ({ email: (c.email || c.emailAddress || '').trim() }))
    .filter(c => c.email);
}

// ── Test send: single email to confirm SES + WP pipeline is working ──────────
async function runTestSend(toEmail) {
  console.log(`🧪 Test send to ${toEmail}...`);

  const articles = await fetchArticlesForNewsletter();
  if (articles.length === 0) throw new Error('No articles available for test send');

  console.log(`Test send using ${articles.length} articles from ${articles[0]?.source || 'unknown'}`);

  const result = await generatePremiumNewsletter(articles);
  await sendEmail({ to: toEmail, subject: `[TEST] ${result.subject}`, html: result.html });
  console.log(`✅ Test email sent to ${toEmail}`);
  return result;
}

// ── Main daily newsletter job ─────────────────────────────────────────────────
async function runDailyNewsletter() {
  console.log('📰 Starting daily newsletter job...');

  try {
    // 1. Fetch today's articles from dedollarizenews.com (RSS fallback if none)
    const articles = await fetchArticlesForNewsletter();

    if (articles.length === 0) {
      console.error('❌ No articles found anywhere — newsletter cancelled');
      return;
    }
    console.log(`📄 ${articles.length} articles for today's newsletter`);

    // 2. Premium: WP featured images, Claude summaries
    const premiumResult = await generatePremiumNewsletter(articles);

    const premiumContacts = await getPremiumRecipients();
    console.log(`📧 Premium recipients from DB: ${premiumContacts.length}`);
    if (premiumContacts.length === 0) console.warn('⚠️  No active subscribers found in DB — sent_to will be 0');

    const premiumSend = await sendBulk(premiumContacts, premiumResult.subject, premiumResult.html);
    console.log(`✅ Premium sent — sent: ${premiumSend.sent}, failed: ${premiumSend.failed}${premiumSend.firstError ? `, first error: ${premiumSend.firstError}` : ''}`);

    await db.query(
      `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier)
       VALUES ($1, $2, $3, $4, 'premium')`,
      [premiumResult.subject, premiumResult.html, premiumSend.sent, ['dedollarizenews.com']]
    );

    // 3. Free teaser: Imagen images, 2-sentence teasers
    const freeResult = await generateFreeNewsletter(articles);

    let freeContacts = [];
    try {
      freeContacts = await getFreeRecipients();
    } catch (err) {
      console.warn(`⚠️  GHL free contacts failed (${err.message}) — skipping free teaser`);
    }
    console.log(`📧 Free recipients from GHL: ${freeContacts.length}`);

    const freeSend = await sendBulk(freeContacts, freeResult.subject, freeResult.html);
    console.log(`✅ Free sent — sent: ${freeSend.sent}, failed: ${freeSend.failed}`);

    await db.query(
      `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier)
       VALUES ($1, $2, $3, $4, 'free')`,
      [freeResult.subject, freeResult.html, freeSend.sent, ['dedollarizenews.com']]
    );

    console.log('✅ Daily newsletter job complete.');
  } catch (err) {
    console.error('❌ Newsletter job failed:', err.message, err.stack);
  }
}

// ── Cron wiring (called from index.js) ───────────────────────────────────────
function startCronJob() {
  const schedule = process.env.CRON_SCHEDULE || '0 8 * * *';
  console.log(`📅 Newsletter cron scheduled: ${schedule}`);
  cron.schedule(schedule, runDailyNewsletter, { timezone: 'UTC' });
}

module.exports = { startCronJob, runDailyNewsletter, runTestSend };
