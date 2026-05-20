const axios = require('axios');
const db = require('./supabase');

const GHL_BASE = 'https://services.leadconnectorhq.com';

// ── Load + auto-refresh the OAuth access token ────────────────────────────────
async function getOAuthToken() {
  const { rows } = await db.query(
    `SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE provider = 'ghl' LIMIT 1`
  );

  if (rows.length === 0) {
    throw new Error('No GHL OAuth token found. Visit /oauth/callback to authorize the app.');
  }

  const { access_token, refresh_token, expires_at } = rows[0];

  // Refresh if token expires within 5 minutes
  if (new Date(expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
    console.log('🔄 GHL token expiring — refreshing...');
    return refreshOAuthToken(refresh_token);
  }

  return access_token;
}

async function refreshOAuthToken(refreshToken) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.GHL_CLIENT_ID,
    client_secret: process.env.GHL_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  const res = await axios.post(`${GHL_BASE}/oauth/token`, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const { access_token, refresh_token, expires_in } = res.data;
  const expiresAt = new Date(Date.now() + expires_in * 1000);

  await db.query(
    `UPDATE oauth_tokens
     SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()
     WHERE provider = 'ghl'`,
    [access_token, refresh_token, expiresAt]
  );

  console.log(`✅ GHL token refreshed (expires ${expiresAt.toISOString()})`);
  return access_token;
}

// ── Create and immediately send an email marketing campaign ───────────────────
// Returns { sent, failed, total }
async function sendCampaignToTag({ tag, subject, html, name }) {
  console.log(`📧 Campaign "${name}" → sending to tag [${tag}]`);

  const token = await getOAuthToken();

  try {
    const res = await axios.post(
      `${GHL_BASE}/email-marketing/campaigns`,
      {
        name,
        subject,
        htmlBody: html,
        emailServiceId: process.env.GHL_EMAIL_SERVICE_ID,
        contactTagFilters: [tag],
        status: 'scheduled',
        scheduledAt: new Date().toISOString(),
        locationId: process.env.GHL_LOCATION_ID,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Version: '2021-04-15',
        },
      }
    );

    const total = res.data?.campaign?.totalContacts || res.data?.totalContacts || 0;
    console.log(`✅ Campaign "${name}" created (id: ${res.data?.id || res.data?.campaign?.id || 'ok'}, contacts: ${total})`);
    return { sent: total, failed: 0, total };
  } catch (err) {
    const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`❌ Campaign failed for tag [${tag}]: ${msg}`);
    return { sent: 0, failed: 1, total: 0 };
  }
}

module.exports = { sendCampaignToTag };
