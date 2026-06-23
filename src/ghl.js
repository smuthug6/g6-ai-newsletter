const axios = require('axios');

const GHL_BASE = 'https://services.leadconnectorhq.com';

// ── Fetch all contacts with a given GHL tag ───────────────────────────────────
async function getContactsByTag(tag) {
  const locationId = process.env.GHL_LOCATION_ID;
  const apiKey = process.env.GHL_API_KEY;

  if (!apiKey) throw new Error('GHL_API_KEY not set in environment');
  if (!locationId) throw new Error('GHL_LOCATION_ID not set in environment');

  const contacts = [];
  let page = 1;

  while (true) {
    const res = await axios.get(`${GHL_BASE}/contacts/`, {
      params: { locationId, tag, limit: 100, page },
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
