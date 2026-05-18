const axios = require('axios');

const GHL_BASE = 'https://services.leadconnectorhq.com';

// ── Send an email to a single contact via GHL ─────────────────────────────────
async function sendEmailToContact({ contactId, email, subject, htmlBody }) {
  try {
    await axios.post(
      `${GHL_BASE}/conversations/messages/outbound`,
      {
        type: 'Email',
        contactId,
        subject,
        html: htmlBody,
        // If you have a From name/email configured in GHL, it uses that by default
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GHL_API_KEY}`,
          'Content-Type': 'application/json',
          Version: '2021-04-15',
        },
      }
    );
    return { success: true };
  } catch (err) {
    console.error(`Failed to send to ${email}:`, err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}

// ── Send newsletter to ALL active subscribers ─────────────────────────────────
async function sendNewsletterToAll(subscribers, subject, htmlBody) {
  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    // GHL requires a contactId; fall back to a lookup if missing
    let contactId = sub.ghl_contact_id;

    if (!contactId) {
      contactId = await lookupContactId(sub.email);
    }

    if (!contactId) {
      console.warn(`No GHL contact ID for ${sub.email}, skipping`);
      failed++;
      continue;
    }

    const result = await sendEmailToContact({
      contactId,
      email: sub.email,
      subject,
      htmlBody,
    });

    if (result.success) {
      sent++;
    } else {
      failed++;
    }

    // Small delay to avoid GHL rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`Newsletter sent: ${sent} success, ${failed} failed`);
  return { sent, failed };
}

// ── Look up a GHL contact by email ────────────────────────────────────────────
async function lookupContactId(email) {
  try {
    const res = await axios.get(`${GHL_BASE}/contacts/search/duplicate`, {
      params: { locationId: process.env.GHL_LOCATION_ID, email },
      headers: {
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        Version: '2021-04-15',
      },
    });
    return res.data?.contact?.id || null;
  } catch {
    return null;
  }
}

module.exports = { sendNewsletterToAll, sendEmailToContact };
