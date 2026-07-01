# G6 AI Newsletter — De-Dollarize News

Fully automated daily email newsletter platform for De-Dollarize News. Two tiers — free teaser and premium Inner Circle — sent every morning at 8am EDT via AWS SES.

**Live:** https://ai.g6platform.com

---

## How it works

### Daily Pipeline
```
7:00am EDT  — Fetches Dream 100 RSS sources, Grok-3 ranks top 10 stories
7:55am EDT  — Auto-approves top 5 (if not manually approved via dashboard)
8:00am EDT  — Generates and sends both newsletters simultaneously
```

### Free Newsletter
- Top 3 Dream 100 stories with AI-generated images (Google Imagen 4) and Claude-written teasers
- 2 recent articles from dedollarizenews.com via RSS
- Two CTAs to upgrade to Inner Circle
- Sent to GHL contacts tagged `ddn-free`

### Premium Newsletter (Inner Circle)
- Latest Inner Circle article fetched from `dedollarizenews.com/category/inner-circle/feed/`
- Claude writes two paragraphs — one faithful to original, one expanding with depth
- Sent to active subscribers stored in Neon DB (tagged `ddn-inner-circle` in GHL)

---

## Tech Stack

| Layer | Service |
|-------|---------|
| Hosting | Render (web service) |
| Database | Neon DB (PostgreSQL, paid plan) |
| Email delivery | AWS SES via SMTP |
| CRM | GoHighLevel (GHL) |
| Newsletter writing | Claude Sonnet 4.6 (Anthropic) |
| Content ranking | Grok-3 (xAI) |
| Image generation | Google Imagen 4 |
| Image hosting | AWS S3 (`g6-newsletter-images`) |
| RSS proxy | rss2json.com (bypasses Cloudflare) |

---

## File Structure

```
src/
  index.js                — Express server + cron wiring
  supabase.js             — Neon DB connection (pg Pool)
  newsletter.js           — Email HTML generation (Claude + Imagen)
  email.js                — AWS SES SMTP + personalized unsubscribe URLs
  ghl.js                  — GHL API: fetch contacts, remove tags
  wordpressFetcher.js     — Inner Circle + DDN articles via rss2json
  jobs/
    dailyNewsletter.js    — Cron jobs + free/premium send logic
    contentAggregator.js  — Dream 100 RSS fetch + Grok-3 ranking
  routes/
    admin.js              — Admin dashboard API
    unsubscribe.js        — Self-hosted unsubscribe (HMAC signed)
    webhook.js            — GHL subscribe/cancel webhooks
    sesEvents.js          — AWS SNS email event tracking
    oauth.js              — GHL OAuth token storage
public/
  admin.html              — Admin dashboard UI
CLAUDE.md                 — Full project memory for Claude Code sessions
ARCHITECTURE.html         — Visual system architecture diagram
render.yaml               — Render deployment config
```

---

## Environment Variables (set in Render)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon DB connection string |
| `ANTHROPIC_API_KEY` | Claude Sonnet 4.6 |
| `GROK_API_KEY` | xAI Grok-3 content ranking |
| `GOOGLE_AI_KEY` | Google Imagen 4 image generation |
| `GHL_API_KEY` | GoHighLevel private integration key |
| `GHL_LOCATION_ID` | GHL location ID |
| `GHL_WEBHOOK_SECRET` | Admin dashboard password + HMAC signing |
| `SES_SMTP_USERNAME` | AWS SES SMTP credentials |
| `SES_SMTP_PASSWORD` | AWS SES SMTP credentials |
| `SES_FROM_EMAIL` | newsletter@mail.dedollarizenews.com |
| `AWS_S3_ACCESS_KEY_ID` | S3 image uploads |
| `AWS_S3_SECRET_ACCESS_KEY` | S3 image uploads |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `subscribers` | Premium paid subscribers (status: active/frozen) |
| `newsletters` | Log of every send (subject, tier, sent_to, send_id) |
| `daily_articles` | Daily content queue (Dream 100 + Grok scores) |
| `email_events` | Open/click/bounce tracking via AWS SNS |
| `oauth_tokens` | GHL OAuth token storage |

---

## Admin Dashboard

Visit https://ai.g6platform.com and enter your `GHL_WEBHOOK_SECRET` as the password.

**Features:**
- Live stats (active/frozen subscribers, recent sends)
- Content queue — approve/reject/reorder Dream 100 articles before send
- Preview free teaser or premium newsletter
- Manual send — free only, premium only, or both
- Subscriber list (scrollable) — freeze/activate individual subscribers
- Analytics — opens, clicks, bounces per newsletter

---

## Unsubscribe System

Self-hosted at `GET /unsubscribe?email=xxx&sig=xxx`

- Each email gets a unique HMAC-signed unsubscribe link injected automatically per recipient
- On click: removes `ddn-free` and `ddn-inner-circle` tags from GHL, freezes in Neon DB
- Shows a branded confirmation page

---

## Deploy

1. Push changes to GitHub (`main` branch)
2. Render dashboard → g6-ai-newsletter → **Manual Deploy → Deploy latest commit**
3. Wait ~2 minutes for Live status

---

## AWS SES Limits

- Daily quota: 50,000 emails per 24 hours
- Max send rate: 14 emails/second
- Current send delay: 100ms per email (10/sec — safely under limit)
