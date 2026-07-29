const cron = require('node-cron');
const { randomUUID } = require('crypto');
const db = require('../supabase');
const { generatePremiumNewsletter, generateFreeNewsletter, generateEveningNewsletter } = require('../newsletter');
const { fetchLatestInnerCircleArticle } = require('../wordpressFetcher');
const { runContentAggregator, autoApproveTop5 } = require('./contentAggregator');
const { getContactsByTag, lookupContactByEmail, removeTagsFromContact, addTagToContact } = require('../ghl');
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
async function getApprovedQueueArticles(limit = 3, offset = 0) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { rows } = await db.query(
    `SELECT * FROM daily_articles
     WHERE approved = true AND created_at >= $1
     ORDER BY score DESC LIMIT $2 OFFSET $3`,
    [todayStart.toISOString(), limit, offset]
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
  console.log('📰 Sending free teaser (batched)...');
  try {
    const queueArticles = await getApprovedQueueArticles();
    if (queueArticles.length === 0) throw new Error('No approved articles in queue — approve articles first');
    const freeResult = await generateFreeNewsletter(queueArticles);
    let allContacts = [];
    try { allContacts = await getFreeRecipients(); } catch (err) { console.warn(`⚠️ GHL failed: ${err.message}`); }
    if (allContacts.length === 0) throw new Error('No free contacts found');

    const total = allContacts.length;
    const batchSize = Math.ceil(total / 4);
    const batches = Array.from({ length: 4 }, (_, i) =>
      allContacts.slice(i * batchSize, (i + 1) * batchSize)
    ).filter(b => b.length > 0);

    const freeSendId = randomUUID();
    const startTime = Date.now();
    const batchDelays = [0, 30, 60, 90];

    console.log(`📧 Free recipients: ${total} → ${batches.length} batches of ~${batchSize}`);

    await db.query(
      `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier, send_id) VALUES ($1, $2, 0, $3, 'free', $4)`,
      [freeResult.subject, freeResult.html, ['dream100'], freeSendId]
    );

    // Fire batches in background
    (async () => {
      let totalSent = 0;
      for (let i = 0; i < batches.length; i++) {
        const waitMs = (startTime + batchDelays[i] * 60 * 1000) - Date.now();
        if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
        console.log(`📧 Batch ${i + 1}/${batches.length} — ${batches[i].length} contacts...`);
        const result = await sendBulk(batches[i], freeResult.subject, freeResult.html, { tier: 'free', sendId: freeSendId });
        totalSent += result.sent;
        console.log(`✅ Batch ${i + 1} done — sent: ${result.sent} | total: ${totalSent}`);
        try {
          await db.query('SELECT 1');
          await db.query(`UPDATE newsletters SET sent_to = $1 WHERE send_id = $2`, [totalSent, freeSendId]);
        } catch (err) { console.warn(`⚠️ DB update failed batch ${i + 1}: ${err.message}`); }
      }
      console.log(`✅ All batches complete — total sent: ${totalSent}`);
    })().catch(err => console.error('❌ Batch error:', err.message));

    return { message: `Batched send started — ${batches.length} batches of ~${batchSize} over 90 minutes` };
  } catch (err) {
    console.error('❌ Free send failed:', err.message);
    throw err;
  }
}

// ── 8:00am UTC: send both newsletters ────────────────────────────────────────
async function runDailyNewsletter() {
  console.log('📰 Starting daily newsletter job...');

  try {
    // ── PREMIUM: Mon-Fri only (authors don't publish on weekends) ────────────
    const dayOfWeek = new Date().getUTCDay(); // 0=Sun, 6=Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log('⏭️  Premium newsletter skipped — weekend (Mon-Fri only)');
    } else
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

    // ── FREE TEASER: 4 batches at 8:00, 8:30, 9:00, 9:30am EDT ─────────────────
    const queueArticles = await getApprovedQueueArticles();
    if (queueArticles.length === 0) {
      console.warn('⚠️  No approved articles in queue — skipping free teaser');
    } else {
      console.log(`📄 ${queueArticles.length} approved articles for free teaser`);
      const freeResult = await generateFreeNewsletter(queueArticles);

      let allContacts = [];
      try {
        allContacts = await getFreeRecipients();
      } catch (err) {
        console.warn(`⚠️  GHL contacts failed (${err.message}) — skipping free send`);
      }

      if (allContacts.length === 0) {
        console.warn('⚠️  No free contacts found — skipping');
      } else {
        // Split into 4 equal batches
        const total = allContacts.length;
        const batchSize = Math.ceil(total / 4);
        const batches = Array.from({ length: 4 }, (_, i) =>
          allContacts.slice(i * batchSize, (i + 1) * batchSize)
        ).filter(b => b.length > 0);

        const freeSendId = randomUUID();
        const startTime = Date.now();
        const batchDelays = [0, 30, 60, 90]; // minutes from start

        console.log(`📧 Free recipients: ${total} split into ${batches.length} batches of ~${batchSize}`);

        // Insert newsletter row upfront with 0 sent — updated after each batch
        await db.query(
          `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier, send_id)
           VALUES ($1, $2, 0, $3, 'free', $4)`,
          [freeResult.subject, freeResult.html, ['dream100'], freeSendId]
        );

        // Fire batches in background — doesn't block the main job
        (async () => {
          let totalSent = 0;
          for (let i = 0; i < batches.length; i++) {
            // Wait until target time for this batch
            const targetTime = startTime + batchDelays[i] * 60 * 1000;
            const waitMs = targetTime - Date.now();
            if (waitMs > 0) {
              console.log(`⏳ Batch ${i + 1}/${batches.length}: waiting ${Math.round(waitMs / 60000)} min until ${batchDelays[i]}min mark...`);
              await new Promise(r => setTimeout(r, waitMs));
            }

            console.log(`📧 Sending batch ${i + 1}/${batches.length} — ${batches[i].length} contacts...`);
            const result = await sendBulk(batches[i], freeResult.subject, freeResult.html, { tier: 'free', sendId: freeSendId });
            totalSent += result.sent;
            console.log(`✅ Batch ${i + 1} done — sent: ${result.sent}, failed: ${result.failed} | total so far: ${totalSent}`);

            // Update sent_to after each batch
            try {
              await db.query('SELECT 1');
              await db.query(`UPDATE newsletters SET sent_to = $1 WHERE send_id = $2`, [totalSent, freeSendId]);
            } catch (err) {
              console.warn(`⚠️  Failed to update sent_to after batch ${i + 1}: ${err.message}`);
            }
          }
          console.log(`✅ All ${batches.length} free batches complete — total sent: ${totalSent}`);
        })().catch(err => console.error('❌ Batched free send error:', err.message));
      }
    }

    console.log('✅ Daily newsletter job complete.');
  } catch (err) {
    console.error('❌ Newsletter job failed:', err.message, err.stack);
  }
}

// ── Bounce + complaint cleanup: runs nightly at 11pm EDT ─────────────────────
async function runBounceCleanup() {
  console.log('🧹 Running bounce + complaint cleanup...');
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    // Fetch hard bounces + complaints in one query
    const { rows: contacts } = await db.query(`
      SELECT DISTINCT email, tier, event_type
      FROM email_events
      WHERE (
        (event_type = 'bounce' AND bounce_type = 'Permanent')
        OR event_type = 'complaint'
      )
      AND event_time >= $1
    `, [since.toISOString()]);

    if (contacts.length === 0) {
      console.log('✅ No hard bounces or complaints today');
      return;
    }

    const bounces = contacts.filter(c => c.event_type === 'bounce');
    const complaints = contacts.filter(c => c.event_type === 'complaint');
    console.log(`🔍 ${bounces.length} hard bounce(s), ${complaints.length} complaint(s) to process`);

    let freed = 0, premiumFrozen = 0, failed = 0;

    for (const { email, tier, event_type } of contacts) {
      const isComplaint = event_type === 'complaint';
      const freeTag = isComplaint ? 'complained-ddn-free' : 'bounced-ddn-free';
      const logLabel = isComplaint ? '🚫 Complaint' : '🗑️  Hard bounce';

      try {
        if (tier === 'free') {
          const contactId = await lookupContactByEmail(email);
          if (contactId) {
            await removeTagsFromContact(contactId, ['ddn-free']);
            await addTagToContact(contactId, freeTag);
            console.log(`${logLabel}: removed ddn-free, added ${freeTag} — ${email}`);
            freed++;
          }
        } else if (tier === 'premium') {
          await db.query(`UPDATE subscribers SET status = 'frozen', frozen_at = NOW() WHERE email = $1`, [email]);
          console.log(`${logLabel}: premium frozen in DB — ${email}`);
          premiumFrozen++;
        }
      } catch (err) {
        console.error(`Failed to process ${event_type} for ${email}: ${err.message}`);
        failed++;
      }
    }

    console.log(`✅ Cleanup done — free removed: ${freed}, premium frozen: ${premiumFrozen}, failed: ${failed}`);
  } catch (err) {
    console.error('❌ Cleanup failed:', err.message);
  }
}

// ── Evening newsletter: articles 4,5,6 — sends at 4pm EDT ────────────────────
async function runEveningNewsletter() {
  console.log('🌆 Sending evening newsletter...');
  try {
    // Fetches today's DDN articles internally
    const result = await generateEveningNewsletter();

    let allContacts = [];
    try { allContacts = await getFreeRecipients(); } catch (err) { console.warn(`⚠️ GHL failed: ${err.message}`); }
    if (allContacts.length === 0) throw new Error('No free contacts found');

    const sendId = randomUUID();
    console.log(`📧 Evening recipients: ${allContacts.length}`);

    const send = await sendBulk(allContacts, result.subject, result.html, { tier: 'free', sendId });
    console.log(`✅ Evening sent — sent: ${send.sent}, failed: ${send.failed}`);

    try {
      await db.query('SELECT 1');
      await db.query(
        `INSERT INTO newsletters (subject, html_content, sent_to, topics, tier, send_id) VALUES ($1, $2, $3, $4, 'free', $5)`,
        [result.subject, result.html, send.sent, ['dream100-evening'], sendId]
      );
    } catch (err) { console.warn(`⚠️ DB log failed: ${err.message}`); }

    return { message: `Evening send complete — ${send.sent} sent` };
  } catch (err) {
    console.error('❌ Evening newsletter failed:', err.message);
    throw err;
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
  cron.schedule('0 23 * * *', runDailyNewsletter, { timezone: 'UTC' });
  console.log('📅 Cron: newsletter send PAUSED (11:00pm UTC temporary)');

  // 8:00pm UTC (4:00pm EDT) — evening newsletter (articles 4,5,6)
  cron.schedule('15 20 * * *', runEveningNewsletter, { timezone: 'UTC' });
  console.log('📅 Cron: evening newsletter at 4:15pm EDT (8:15pm UTC)');

  // 3:00am UTC (11:00pm EDT) — process hard bounces from the day's send
  cron.schedule('0 3 * * *', runBounceCleanup, { timezone: 'UTC' });
  console.log('📅 Cron: bounce cleanup at 11:00pm EDT (3:00am UTC)');
}

module.exports = { startCronJob, runDailyNewsletter, runPremiumNewsletter, runFreeNewsletter, runEveningNewsletter, runTestSend, runAggregatorJob, runAutoApproveJob, runBounceCleanup };
