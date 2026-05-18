const cron = require('node-cron');
const db = require('../supabase');
const { generateNewsletter } = require('../newsletter');
const { sendNewsletterToAll } = require('../ghl');

async function runDailyNewsletter() {
  console.log('📰 Starting daily newsletter job...');

  const topics = (process.env.NEWSLETTER_TOPICS || 'AI news,AI tools,automation')
    .split(',')
    .map(t => t.trim());

  try {
    const { rows: subscribers } = await db.query(
      `SELECT id, email, full_name, ghl_contact_id FROM subscribers WHERE status = 'active'`
    );

    if (!subscribers || subscribers.length === 0) {
      console.log('No active subscribers, skipping send.');
      return;
    }

    console.log(`Found ${subscribers.length} active subscribers`);

    const { subject, html } = await generateNewsletter(topics);
    console.log(`Newsletter generated: "${subject}"`);

    const { sent, failed } = await sendNewsletterToAll(subscribers, subject, html);

    await db.query(
      `INSERT INTO newsletters (subject, html_content, sent_to, topics) VALUES ($1, $2, $3, $4)`,
      [subject, html, sent, topics]
    );

    console.log(`✅ Newsletter job complete. Sent: ${sent}, Failed: ${failed}`);
  } catch (err) {
    console.error('❌ Newsletter job failed:', err.message);
  }
}

function startCronJob() {
  const schedule = process.env.CRON_SCHEDULE || '0 8 * * *';
  console.log(`📅 Newsletter cron scheduled: ${schedule}`);
  cron.schedule(schedule, runDailyNewsletter, { timezone: 'UTC' });
}

module.exports = { startCronJob, runDailyNewsletter };
