const axios = require('axios');
const db = require('./supabase');

const GHL_BASE = 'https://services.leadconnectorhq.com';

// ── Load the stored location-level OAuth access token ─────────────────────────
async function getLocationToken() {
  const { rows } = await db.query(
    `SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE provider = 'ghl_location' LIMIT 1`
  );

  if (rows.length === 0) {
    throw new Error('No GHL location token found. Re-authorize the OAuth app.');
  }

  const { access_token, refresh_token, expires_at } = rows[0];

  // Refresh if token expires within 5 minutes
  if (new Date(expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
    console.log('🔄 GHL location token expiring — refreshing...');
    return refreshLocationToken(refresh_token);
  }

  return access_token;
}

async function refreshLocationToken(refreshToken) {
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
    `UPDATE oauth_tokens SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()
     WHERE provider = 'ghl_location'`,
    [access_token, refresh_token, expiresAt]
  );

  console.log(`✅ GHL location token refreshed (expires ${expiresAt.toISOString()})`);
  return access_token;
}

// ── Fetch all contacts with a given GHL tag ───────────────────────────────────
async function getContactsByTag(tag) {
  const token = await getLocationToken();
  const locationId = process.env.GHL_LOCATION_ID;
  const contacts = [];
  let page = 1;

  while (true) {
    const res = await axios.get(`${GHL_BASE}/contacts/`, {
      params: { locationId, tag, limit: 100, page },
      headers: {
        Authorization: `Bearer ${token}`,
        Version: '2021-04-15',
      },
    });

    const batch = res.data?.contacts || [];
    contacts.push(...batch);
    if (batch.length < 100) break;
    page++;
  }

  return contacts;
}

module.exports = { getContactsByTag };
