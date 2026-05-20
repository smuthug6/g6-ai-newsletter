const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../supabase');

const GHL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';

// ── GET /oauth/callback — GHL redirects here after user authorizes ────────────
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) return res.status(400).send(`OAuth error: ${error}`);
  if (!code) return res.status(400).send('No authorization code in redirect.');

  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.GHL_CLIENT_ID,
      client_secret: process.env.GHL_CLIENT_SECRET,
      code,
      redirect_uri: process.env.GHL_REDIRECT_URI,
    });

    const tokenRes = await axios.post(GHL_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token, refresh_token, expires_in, locationId } = tokenRes.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    await db.query(
      `INSERT INTO oauth_tokens (provider, access_token, refresh_token, expires_at, location_id)
       VALUES ('ghl', $1, $2, $3, $4)
       ON CONFLICT (provider) DO UPDATE SET
         access_token  = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at    = EXCLUDED.expires_at,
         location_id   = EXCLUDED.location_id,
         updated_at    = NOW()`,
      [access_token, refresh_token, expiresAt, locationId || process.env.GHL_LOCATION_ID]
    );

    console.log(`✅ GHL OAuth tokens stored (expires ${expiresAt.toISOString()})`);

    res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#fff;">
      <h1 style="color:#cc0000;">✅ GHL Connected!</h1>
      <p>OAuth tokens saved successfully. You can close this window.</p>
      <p style="color:#666;font-size:13px;">Token expires: ${expiresAt.toLocaleString()}</p>
    </body></html>`);
  } catch (err) {
    const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('OAuth callback error:', msg);
    res.status(500).send(`Token exchange failed: ${msg}`);
  }
});

module.exports = router;
