const axios = require('axios');

const GHL_BASE = 'https://services.leadconnectorhq.com';

const GHL_HEADERS = {
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  'Content-Type': 'application/json',
  Version: '2021-04-15',
};

// ── Create and immediately schedule a GHL email campaign ─────────────────────
async function createEmailCampaign({ name, subject, html, tag }) {
  const scheduledDateTime = new Date(Date.now() + 60_000).toISOString(); // 1 min from now

  const body = {
    name,
    subject,
    html,
    locationId: process.env.GHL_LOCATION_ID,
    contactTagFilters: [tag],
    status: 'scheduled',
    scheduledDateTime,
  };

  try {
    const res = await axios.post(
      `${GHL_BASE}/email-marketing/campaigns`,
      body,
      { headers: GHL_HEADERS }
    );

    const campaign = res.data?.campaign || res.data;
    console.log(`✅ GHL campaign created: "${name}" (id: ${campaign?.id || '?'}) → tag: [${tag}]`);
    return { success: true, campaignId: campaign?.id };
  } catch (err) {
    const detail = JSON.stringify(err.response?.data || err.message);
    console.error(`❌ GHL campaign FAILED: "${name}" → ${detail}`);
    return { success: false, error: detail };
  }
}

module.exports = { createEmailCampaign };
