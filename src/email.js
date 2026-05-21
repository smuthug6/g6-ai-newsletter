const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.SES_SMTP_USERNAME,
      pass: process.env.SES_SMTP_PASSWORD,
    },
  });
  return _transporter;
}

const FROM = `"De-Dollarize News" <${process.env.SES_FROM_EMAIL || 'newsletter@mail.dedollarizenews.com'}>`;

// Send to a single address
async function sendEmail({ to, subject, html }) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: FROM,
    to,
    subject,
    html,
    headers: {
      'List-Unsubscribe': '<https://dedollarizenews.com/unsubscribe>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}

// Send to a list of contacts [{email, id}] — returns { sent, failed }
async function sendBulk(contacts, subject, html) {
  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    const email = contact.email || contact.emailAddress;
    if (!email) { failed++; continue; }
    try {
      await sendEmail({ to: email, subject, html });
      sent++;
    } catch (err) {
      console.warn(`   ⚠️  Failed to send to ${email}: ${err.message}`);
      failed++;
    }
    // Avoid SES throttle (14 msgs/sec max on sandbox, 200/sec on production)
    await new Promise(r => setTimeout(r, 100));
  }

  return { sent, failed };
}

module.exports = { sendEmail, sendBulk };
