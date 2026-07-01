# G6 AI Newsletter — Claude Memory File
# Read this first in every new session before doing anything

---

## WHO YOU ARE TALKING TO
- Name: Sab (sabareshabhi@gmail.com — do NOT add this to the subscriber list, it was a test)
- Company: G6 Platform
- Project: De-Dollarize News Newsletter Platform
- Teammate: Dan (daniel@g6platform.com)

---

## THE PROJECT
**What it is:** A fully automated daily email newsletter platform for "De-Dollarize News" — a financial newsletter about de-dollarization, gold, silver, dollar collapse, and wealth protection.

**Live URL:** https://ai.g6platform.com  
**Code:** `/Users/g6dev/Desktop/g6-ai-newsletter`  
**GitHub:** https://github.com/smuthug6/g6-ai-newsletter (account: smuthug6)  
**Render service:** g6-ai-newsletter  
**Language:** JavaScript (Node.js v24)  

---

## TWO NEWSLETTER TIERS

### FREE NEWSLETTER
- **Recipients:** GHL contacts tagged `ddn-free` (~280+ contacts)
- **Content:** Top 3 Dream 100 teasers + AI images + 2 DDN articles + 2 CTAs
- **Send time:** 8am EDT daily via AWS SES

### PREMIUM NEWSLETTER (Inner Circle)
- **Recipients:** 31 active subscribers in Neon DB (tagged `ddn-inner-circle` in GHL)
- **Content:** Latest Inner Circle article from dedollarizenews.com/category/inner-circle/feed/ — full-width image, big headline, 2 Claude paragraphs, red CTA button
- **Send time:** 8am EDT daily via AWS SES

---

## DAILY CRON SCHEDULE (all EDT)
```
7:00am  — Content aggregator: fetches Dream 100 RSS, Grok-3 ranks top 10, saves to daily_articles DB
7:55am  — Auto-approve top 5 if not manually approved
8:00am  — BOTH newsletters send simultaneously
```

---

## TECH STACK
- **Hosting:** Render (web service, auto-deploys from GitHub main branch)
- **Database:** Neon DB (PostgreSQL, paid plan, scale to zero after 5min)
  - Connection: pg Pool in `src/supabase.js`
  - Tables: subscribers, newsletters, daily_articles, email_events, oauth_tokens
- **Email delivery:** AWS SES SMTP via nodemailer (14/sec rate, 50k/day quota)
- **CRM:** GoHighLevel (GHL) — API key in Render env vars
- **AI:** Claude Sonnet 4.6 (newsletter writing), Grok-3/xAI (content ranking), Google Imagen 4 (story images)
- **Image hosting:** AWS S3 bucket `g6-newsletter-images`
- **RSS proxy:** rss2json.com (bypasses Cloudflare on Render IPs)

---

## KEY ENV VARS (set in Render, NOT in local .env)
```
DATABASE_URL           — Neon DB connection string
ANTHROPIC_API_KEY      — Claude API
GHL_API_KEY            — GoHighLevel (valid, in Render)
GHL_LOCATION_ID        — GHL location
GHL_WEBHOOK_SECRET     — Admin dashboard password + HMAC signing key
GROK_API_KEY           — xAI Grok-3
GOOGLE_AI_KEY          — Google Imagen 4
SES_SMTP_USERNAME      — AWS SES
SES_SMTP_PASSWORD      — AWS SES
SES_FROM_EMAIL         — newsletter@mail.dedollarizenews.com
AWS_S3_ACCESS_KEY_ID   — S3 uploads
AWS_S3_SECRET_ACCESS_KEY — S3 uploads
```
Note: Local `.env` has stale/different values for some keys. Always use Render env vars as source of truth for production.

---

## FILE STRUCTURE
```
g6-ai-newsletter/
├── src/
│   ├── index.js              — Express server + cron wiring
│   ├── supabase.js           — Neon DB pg Pool
│   ├── newsletter.js         — generatePremiumNewsletter() + generateFreeNewsletter()
│   ├── email.js              — sendBulk() + generateUnsubscribeUrl() (HMAC)
│   ├── ghl.js                — getContactsByTag() + lookupContactByEmail() + removeTagsFromContact()
│   ├── wordpressFetcher.js   — fetchLatestInnerCircleArticle() + fetchRecentDDNArticles() via rss2json
│   ├── jobs/
│   │   ├── dailyNewsletter.js    — runDailyNewsletter(), runPremiumNewsletter(), runFreeNewsletter()
│   │   └── contentAggregator.js  — fetchAllFeeds(), rankWithGrok(), saveTopicsToQueue()
│   └── routes/
│       ├── admin.js          — All admin API endpoints
│       ├── unsubscribe.js    — GET /unsubscribe?email=xxx&sig=xxx
│       ├── webhook.js        — GHL subscribe/cancel webhooks
│       ├── oauth.js          — GHL OAuth
│       └── sesEvents.js      — AWS SNS event tracking
├── public/
│   └── admin.html            — Admin dashboard UI
├── ARCHITECTURE.html         — Visual system diagram (light theme)
├── ARCHITECTURE.md           — Text version of architecture
└── render.yaml               — Render deploy config
```

---

## ADMIN DASHBOARD
- URL: https://ai.g6platform.com
- Password: stored as GHL_WEBHOOK_SECRET in Render
- Features: stats, content queue (approve/reject articles), preview free/premium, send free/premium/both, subscribers list (scrollable), analytics

---

## CONTENT PIPELINE (FREE)
1. Dream 100 RSS sources fetched via `rss-parser`
2. Keywords filter (40+ financial terms)
3. Grok-3 ranks top 10 by virality score (1-100)
4. Saved to `daily_articles` table
5. Top 3 approved articles used in free newsletter
6. Claude writes 2-sentence teasers per story
7. Google Imagen 4 generates images from headlines → S3
8. rss2json fetches 2 recent DDN articles with real images

## CONTENT PIPELINE (PREMIUM)
1. Fetches `dedollarizenews.com/category/inner-circle/feed/` via rss2json.com proxy
2. Takes the LATEST article
3. Claude writes 2 paragraphs (faithful to excerpt + expanded curiosity builder)
4. No em dashes (—) in content — explicitly told to Claude
5. Sends to 31 Neon DB active subscribers

---

## UNSUBSCRIBE SYSTEM
- Self-hosted at `GET /unsubscribe?email=xxx&sig=xxx`
- HMAC-SHA256 signed with GHL_WEBHOOK_SECRET (first 16 chars of hex)
- On click: freezes in Neon DB + removes `ddn-free` AND `ddn-inner-circle` tags from GHL
- URL auto-injected per contact in `sendBulk()` via placeholder `UNSUBSCRIBE_URL_PLACEHOLDER`
- Shows branded confirmation page on dedollarizenews.com domain style

---

## GHL SETUP
- Free list: contacts tagged `ddn-free`
- Premium list: contacts tagged `ddn-inner-circle` (31 contacts migrated to Neon DB)
- GHL webhook at `/webhook/ghl`: event=subscribe adds to DB, event=cancel freezes
- GHL API key: private integration (static, doesn't expire)
- GHL trigger links don't work with SES sends (only work when GHL sends email) — that's why we built self-hosted unsubscribe

---

## AWS SES LIMITS
- Daily quota: 50,000 emails/24hrs
- Max send rate: 14 emails/second
- Our delay: 100ms per email (10/sec — safe under limit)
- SES config set: `newsletter-tracking`
- Events tracked via SNS → `/ses-events` → `email_events` table

---

## IMPORTANT BUGS FIXED (history)
- Neon DB 4-min ping removed (was burning free compute quota)
- Claude model updated from `claude-sonnet-4-20250514` (retired) to `claude-sonnet-4-6`
- Anthropic SDK upgraded from 0.24 to 0.105
- GHL OAuth tokens expired → switched to static GHL_API_KEY
- WP REST API 403 (Cloudflare blocks Render IPs) → switched to rss2json proxy
- Duplicate aggregator cron removed from index.js
- DB connection timeout increased to 60s + wake-up ping before aggregator

---

## DEPLOY PROCESS
1. Make code changes locally in `/Users/g6dev/Desktop/g6-ai-newsletter/`
2. `git add`, `git commit`, `git push origin main`
3. Go to Render dashboard → g6-ai-newsletter → **Manual Deploy → Deploy latest commit**
4. Wait 2-3 minutes for "Live" status
5. NOTE: Render auto-deploy from GitHub is NOT reliably enabled — always manual deploy after pushing

---

## DATABASE QUICK CHECKS
Run these locally to check DB state:
```bash
cd /Users/g6dev/Desktop/g6-ai-newsletter
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\"SELECT COUNT(*) FROM subscribers WHERE status = 'active'\").then(r => { console.log('Active:', r.rows[0].count); pool.end(); });
"
```

Check GHL contacts for any tag:
```bash
curl "https://ai.g6platform.com/admin/ghl-contacts?token=TOKEN&tag=TAG_NAME"
```

---

## WHAT IS NOT YET DONE
- SES daily quota increase (needed before scaling to 70k contacts — teammate to request in AWS)
- Render auto-deploy not configured (manual deploy needed after every push)

---

## NOTES / PREFERENCES
- User prefers concise answers — don't over-explain
- Always ask before pushing to GitHub if it's not a bug fix or feature
- Never add em dashes (—) in newsletter content
- The word "Unsubscribe" in emails should always be small and subtle gray (not red)
- Image prompts for free newsletter: clean editorial photography, bright natural lighting (NOT dark/dramatic)
