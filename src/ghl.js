const axios = require('axios');

const GHL_BASE = 'https://services.leadconnectorhq.com';

// ── Fetch all contacts with a given GHL tag ───────────────────────────────────
async function getContactsByTag(tag) {
  const locationId = process.env.GHL_LOCATION_ID;
  const apiKey = process.env.GHL_API_KEY;

  if (!apiKey) throw new Error('GHL_API_KEY not set in environment');
  if (!locationId) throw new Error('GHL_LOCATION_ID not set in environment');

  const headers = { Authorization: `Bearer ${apiKey}`, Version: '2021-04-15' };
  const contacts = [];
  let page = 1;

  while (true) {
    let batch = null;
    let lastErr = null;

    // Retry up to 3 times per page
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await axios.get(`${GHL_BASE}/contacts/`, {
          params: { locationId, tag, limit: 100, page },
          headers,
          timeout: 10000,
        });
        batch = res.data?.contacts || [];
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`GHL page ${page} attempt ${attempt} failed: ${err.message} — retrying...`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }

    if (batch === null) {
      console.error(`GHL page ${page} failed after 3 attempts: ${lastErr?.message}`);
      break;
    }

    contacts.push(...batch);
    if (batch.length < 100) break;

    // Small gap between pages to avoid GHL rate limiting
    await new Promise(r => setTimeout(r, 50));
    page++;
  }

  console.log(`GHL: fetched ${contacts.length} contacts for tag "${tag}" (${page} pages)`);
  return contacts;
}

// ── Look up a GHL contact ID by email ────────────────────────────────────────
async function lookupContactByEmail(email) {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const res = await axios.get(`${GHL_BASE}/contacts/search/duplicate`, {
    params: { locationId, email },
    headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-04-15' },
  });
  return res.data?.contact?.id || null;
}

// ── Remove tags from a GHL contact ───────────────────────────────────────────
async function removeTagsFromContact(contactId, tags) {
  const apiKey = process.env.GHL_API_KEY;
  await axios.delete(`${GHL_BASE}/contacts/${contactId}/tags`, {
    data: { tags },
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: '2021-04-15',
      'Content-Type': 'application/json',
    },
  });
}

// ── Add a tag to a GHL contact ────────────────────────────────────────────────
async function addTagToContact(contactId, tag) {
  const apiKey = process.env.GHL_API_KEY;
  await axios.post(`${GHL_BASE}/contacts/${contactId}/tags`, { tags: [tag] }, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: '2021-04-15',
      'Content-Type': 'application/json',
    },
  });
}

module.exports = { getContactsByTag, lookupContactByEmail, removeTagsFromContact, addTagToContact };
