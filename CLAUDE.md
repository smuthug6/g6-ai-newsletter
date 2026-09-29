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

## THREE NEWSLETTER TYPES

### FREE NEWSLETTER (Morning Teaser)
- **Recipients:** GHL contacts tagged `ddn-free-active` (currently ~1,679 contacts — clean active list)
- **Content:** Top 3 Dream 100 teasers + AI images + 2 DDN articles + 2 CTAs
- **Send:** Manual only via admin dashboard. Batches into 4 sends over 90 minutes.
- **Status:** Paused for now — only evening is being sent daily

### EVENING NEWSLETTER
- **Recipients:** GHL contacts tagged `ddn-free-active` (same 1,679 contacts)
- **Content:** "While You Were Distracted" — 3 today's DDN articles, Claude curiosity paragraphs, banking article promoted to #1. Article links are now blue underlined titles (not red dedollarizenews.com)
- **Send:** Manual only. Sends all at once (~3 min for 1,679 contacts). Gracefully skips if no new DDN articles today.
- **Current operation:** This is the ONLY newsletter being sent daily as of Sep 2026

### PREMIUM NEWSLETTER (Inner Circle)
- **Recipients:** ~43–47 active subscribers in Neon DB (tagged `ddn-inner-circle` in GHL)
- **Content:** Latest Inner Circle article + Claude writes 2 paragraphs. No em dashes (—).
- **Send:** Manual only via admin dashboard. Skips weekends only when using "Send Both" — manual "Send Premium Only" sends any day.

---

## SEND LIST — IMPORTANT CHANGE (Sep 2026)
- **OLD tag:** `ddn-free` (~9,970 contacts — had deliverability issues)
- **NEW tag:** `ddn-free-active` (~1,679 contacts — clean curated active list)
- Sab manually tagged clean contacts with `ddn-free-active` in GHL
- All bounce/complaint/unsubscribe cleanup now removes BOTH `ddn-free` AND `ddn-free-active`
- `ddn-free` tag still exists on contacts but is no longer used for sending
- Seed emails added to `ddn-free-active` list for inbox testing

---

## CRON SCHEDULE (all UTC — NO send crons, all sends are manual)
```
11:00am UTC (7:00am EDT)  — Content aggregator: Dream 100 RSS → Grok-3 ranks → saves top 10 to daily_articles
11:55am UTC (7:55am EDT)  — Auto-approve top 5 if none manually approved
3:00am UTC  (11:00pm EDT) — Nightly bounce/complaint/soft-bounce cleanup
```
**Important:** All newsletter sends are manual via the dashboard. No send crons.

---

## TECH STACK
- **Hosting:** Render (web service, free plan — manual deploy required after every push)
- **Database:** Neon DB (PostgreSQL, scale to zero after 5min, wake-up ping before aggregator)
  - Connection: pg Pool in `src/supabase.js` (60s timeout)
  - Tables: subscribers, newsletters, daily_articles, email_events, oauth_tokens
- **Email delivery:** AWS SES SMTP via nodemailer (14/sec max, 50k/day quota, 100ms delay = 10/sec safe)
- **CRM:** GoHighLevel (GHL) — static API key in Render env vars (doesn't expire)
- **AI:** Claude Sonnet 4.6 (newsletter writing), Grok-3/xAI (content ranking), Google Imagen 4 (story images)
- **Image hosting:** AWS S3 bucket `g6-newsletter-images`
- **RSS proxy:** rss2json.com (bypasses Cloudflare blocking Render IPs from hitting DDN directly)

---

## KEY ENV VARS (set in Render, NOT in local .env — local .env is stale)
```
DATABASE_URL           — Neon DB connection string (local .env has valid DB URL)
ANTHROPIC_API_KEY      — Claude API
GHL_API_KEY            — GoHighLevel static key (valid, doesn't expire)
GHL_LOCATION_ID        — GHL location
GHL_WEBHOOK_SECRET     — Admin dashboard password + HMAC signing key (blank in local .env)
GROK_API_KEY           — xAI Grok-3
GOOGLE_AI_KEY          — Google Imagen 4
SES_SMTP_USERNAME      — AWS SES
SES_SMTP_PASSWORD      — AWS SES
SES_FROM_EMAIL         — newsletter@mail.dedollarizenews.com
AWS_S3_ACCESS_KEY_ID   — S3 uploads
AWS_S3_SECRET_ACCESS_KEY — S3 uploads
```

---

## FILE STRUCTURE
```
g6-ai-newsletter/
├── src/
│   ├── index.js              — Express server + cron wiring + startCronJob()
│   ├── supabase.js           — Neon DB pg Pool
│   ├── newsletter.js         — generatePremiumNewsletter(), generateFreeNewsletter(), generateEveningNewsletter()
│   ├── email.js              — sendBulk(), generateUnsubscribeUrl(email, sendId) — HMAC signed, sendId embedded
│   ├── ghl.js                — getContactsByTag(), lookupContactByEmail(), removeTagsFromContact(), addTagToContact()
│   ├── wordpressFetcher.js   — fetchLatestInnerCircleArticle(), fetchRecentDDNArticles(), fetchEveningDDNArticles()
│   ├── jobs/
│   │   ├── dailyNewsletter.js    — runPremiumNewsletter(), runFreeNewsletter(), runEveningNewsletter(), runBounceCleanup()
│   │   └── contentAggregator.js  — fetchAllFeeds(), rankWithGrok(), saveTopicsToQueue(), autoApproveTop5()
│   └── routes/
│       ├── admin.js          — All admin API endpoints
│       ├── unsubscribe.js    — GET /unsubscribe?email=xxx&sig=xxx&send_id=xxx
│       ├── webhook.js        — GHL subscribe/cancel webhooks
│       ├── oauth.js          — GHL OAuth (legacy, not actively used)
│       └── sesEvents.js      — AWS SNS event tracking + real-time GHL tag actions
├── public/
│   └── admin.html            — Admin dashboard UI (light/dark theme, G6 gold #b8862a)
├── ARCHITECTURE.html         — Visual system diagram
└── render.yaml               — Render deploy config (free plan)
```

---

## ADMIN DASHBOARD
- URL: https://ai.g6platform.com
- Password: GHL_WEBHOOK_SECRET (stored in Render)
- Features: stats, content queue (approve/reject/reorder/custom), 3 preview types, 4 send buttons, subscribers list, analytics with drill-down, light/dark theme toggle

---

## GHL TAG SYSTEM — FULL LIST
Every action on the email applies tags in GHL automatically:

| Action | Tag Added | Tags Removed |
|--------|-----------|-------------|
| Click any content/CTA link | `clicked-ddn-free` | — |
| Click unsubscribe link | (excluded — no tag) | — |
| Unsubscribe (clicks our page) | `unsubscribed-ddn-free` | `ddn-free`, `ddn-free-active`, `ddn-inner-circle` |
| Complaint (spam report) | `complained-ddn-free` | `ddn-free`, `ddn-free-active` |
| Hard bounce (Permanent) | `bounced-ddn-free` | `ddn-free`, `ddn-free-active` |
| Soft bounce (3+ times) | `soft-bounced-ddn-free` | `ddn-free`, `ddn-free-active` |

**Send list tags:**
- `ddn-free-active` — CURRENT send list (1,679 clean contacts) — used for free + evening newsletter
- `ddn-free` — old send tag (still on contacts, no longer used for sending)
- `ddn-inner-circle` — premium tier (pulled from Neon DB, not GHL tag)

---

## BOUNCE / COMPLAINT / UNSUBSCRIBE HANDLING

### Real-time (sesEvents.js — fires immediately on SES event):
- **Hard bounce** → removes `ddn-free` + `ddn-free-active`, adds `bounced-ddn-free` in GHL
- **Complaint** → removes `ddn-free` + `ddn-free-active`, adds `complained-ddn-free` in GHL
- **Click** (non-unsubscribe links) → adds `clicked-ddn-free` in GHL
- Unsubscribe link clicks excluded from `clicked-ddn-free` (filtered by link containing "unsubscribe")

### Nightly cleanup at 11pm EDT (runBounceCleanup()):
- Hard bounces + complaints from last 24h → same GHL tag actions (safety net if real-time failed)
- Premium hard bounces/complaints → freeze in Neon DB
- **Soft bounces (3+ total)** → removes `ddn-free` + `ddn-free-active`, adds `soft-bounced-ddn-free`

### Unsubscribe (self-hosted /unsubscribe route — real-time on page visit):
- Removes `ddn-free` + `ddn-free-active` + `ddn-inner-circle` from GHL
- Adds `unsubscribed-ddn-free` to GHL
- Freezes in Neon DB if premium subscriber
- Logs event to email_events WITH send_id (send_id embedded in unsubscribe URL)

### Soft bounces:
- Single soft bounce = ignored (temporary — full inbox, server down etc.)
- 3+ soft bounces = removed from list via nightly cleanup
- One-time cleanup ran Aug 3 2026 — removed 461 repeat soft bouncers

---

## ANALYTICS — HOW IT WORKS
- All events (open, click, bounce, complaint, unsubscribe) tracked via SES → SNS → `/ses-events` → `email_events` table
- Analytics query joins `email_events` to `newsletters` via `send_id`
- **Clicks exclude unsubscribe link clicks** (link NOT LIKE '%unsubscribe%') — fixed Sep 2026
- **Unsubscribes now have send_id** embedded in URL → show correctly per newsletter — fixed Sep 2026
- Historical unsubscribes (before Sep 2026) show 0 — send_id was null, can't retroactively fix
- Apple MPP (Mail Privacy Protection) inflates open rates — Aug 12 (29%) and Aug 21 (40%) were false peaks

---

## DELIVERABILITY STATUS (as of Sep 2026)
- **Problem**: Open rates dropped from 6-9% (Aug) to 3-5% (Sep). Bounce rates hit 1.57-1.75% per send.
- **Root cause**: Rapid list growth (2k → 10k) brought in low-quality/invalid emails
- **Fix applied**: Switched to `ddn-free-active` tag — curated list of 1,679 clean contacts
- **Monitoring**: Seed emails added to list to check inbox placement across Gmail/Outlook/Yahoo
- **Previous platform (Daily AI)**: Was sending to ~54k contacts (33k active + 21k activating) with 23-48% open rates. Contacted them Sep 2026 to request list export.
- **SES complaint threshold**: 0.08% — stay under this at all times

---

## EVENING NEWSLETTER — ARTICLE LINK STYLE (Sep 2026)
- Article links changed from red `dedollarizenews.com` text → blue underlined full article title
- Style: `color:#1a0dab; text-decoration:underline; font-size:15px`
- Looks like a traditional news/Google-style hyperlink — more familiar for readers

---

## UNSUBSCRIBE SYSTEM
- Self-hosted at `GET /unsubscribe?email=xxx&sig=xxx&send_id=xxx`
- HMAC-SHA256 signed with GHL_WEBHOOK_SECRET (first 16 chars of hex)
- send_id embedded in URL so unsubscribes link to correct newsletter in analytics
- Shows branded confirmation page

---

## GHL SETUP
- **Active send list**: `ddn-free-active` (~1,679 contacts as of Sep 2026)
- **Old send list**: `ddn-free` (~9,970 contacts — no longer used for sending)
- GHL API caps at 10,000 contacts per tag (page 101 returns 400) — known issue, needs fix when list grows
- Premium list: `ddn-inner-circle` (pulled from Neon DB, not GHL)
- GHL webhook at `/webhook/ghl`: event=subscribe adds/reactivates in DB, event=cancel freezes
- GHL API key: static private integration key (doesn't expire)

---

## AWS SES LIMITS
- Daily quota: 50,000 emails/24hrs
- Max send rate: 14 emails/second
- Our delay: 100ms per email (10/sec — safe under limit)
- SES config set: `newsletter-tracking`
- Events tracked via SNS → `/ses-events` → `email_events` table
- SES complaint threshold: 0.08% — stay under this or account gets flagged

---

## DEPLOY PROCESS
1. Make code changes locally in `/Users/g6dev/Desktop/g6-ai-newsletter/`
2. `git add`, `git commit`, `git push origin main`
3. Go to Render dashboard → g6-ai-newsletter → **Manual Deploy → Deploy latest commit**
4. Wait 2-3 minutes for "Live" status
5. Render auto-deploy from GitHub is NOT reliably enabled — always manual deploy

---

## DATABASE QUICK CHECKS (run locally — DATABASE_URL is valid in local .env)
```bash
cd /Users/g6dev/Desktop/g6-ai-newsletter

# Active premium subscribers
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL}); p.query(\"SELECT COUNT(*) FROM subscribers WHERE status='active'\").then(r=>{console.log('Active:',r.rows[0].count);p.end()});"

# Last 5 newsletters with analytics
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  SELECT n.subject, n.tier, n.sent_to, n.sent_at,
    COUNT(DISTINCT CASE WHEN e.event_type='open' THEN e.email END) as opens,
    COUNT(DISTINCT CASE WHEN e.event_type='click' AND (e.link IS NULL OR e.link NOT LIKE '%unsubscribe%') THEN e.email END) as clicks,
    COUNT(DISTINCT CASE WHEN e.event_type='bounce' THEN e.email END) as bounces,
    COUNT(DISTINCT CASE WHEN e.event_type='complaint' THEN e.email END) as complaints
  FROM newsletters n
  LEFT JOIN email_events e ON e.send_id = n.send_id
  GROUP BY n.id ORDER BY n.sent_at DESC LIMIT 5
\`).then(r=>{console.log(JSON.stringify(r.rows,null,2));pool.end()});
"
```

---

## FULL CHANGE HISTORY

### Bugs fixed (all time):
- Neon DB 4-min ping removed (was burning free compute quota)
- Claude model updated from `claude-sonnet-4-20250514` (retired) to `claude-sonnet-4-6`
- Anthropic SDK upgraded from 0.24 to 0.105
- GHL OAuth tokens expired → switched to static GHL_API_KEY
- WP REST API 403 (Cloudflare blocks Render IPs) → switched to rss2json proxy
- Duplicate aggregator cron removed from index.js
- DB connection timeout increased to 60s + wake-up ping before aggregator
- Morning + evening send crons removed — all sends are now manual
- One-time soft bounce cleanup ran Aug 3 2026 — removed 461 repeat bouncers

### Sep 2026 changes:
- `sesEvents.js`: Real-time complaint + hard bounce GHL tag removal (both `ddn-free` + `ddn-free-active`)
- `sesEvents.js`: Real-time `clicked-ddn-free` tag on email link clicks (unsubscribe links excluded)
- `unsubscribe.js`: Added `unsubscribed-ddn-free` tag + removes `ddn-free-active` on unsubscribe
- `email.js`: Embedded `send_id` in unsubscribe URL so analytics shows unsubscribes per newsletter
- `admin.js`: Analytics clicks column excludes unsubscribe link clicks
- `dailyNewsletter.js`: Soft bounce nightly cleanup (3+ bounces → remove tags, add `soft-bounced-ddn-free`)
- `dailyNewsletter.js`: Switched send list from `ddn-free` → `ddn-free-active`
- `newsletter.js`: Evening newsletter article links now blue underlined title (was red dedollarizenews.com)

---

## OPEN ITEMS / NEXT STEPS
- **GHL 10k contact cap**: Fix `getContactsByTag()` for lists over 10,000 (page 101 returns 400) — needed when list grows again
- **Daily AI list import**: Contacted Sep 2026 for ~54k contact export (33k active + 21k activating) — awaiting response
- **SES daily quota increase**: Needed before scaling to 50k+ contacts
- **Render auto-deploy**: Not configured — manual deploy required after every push
- **Seed email inbox test**: Added seed emails to `ddn-free-active` — check if landing in inbox after next send
- **Zoom relay call log**: `phone.caller_call_log_completed` payload structure still unconfirmed — need one more test call to fix field mapping

---

## NOTES / PREFERENCES
- Sab prefers concise answers — don't over-explain
- Always ask before pushing to GitHub if it's not a clear bug fix or feature
- Never add em dashes (—) in newsletter content
- The word "Unsubscribe" in emails should always be small and subtle gray (not red)
- Image prompts for free newsletter: clean editorial photography, bright natural lighting (NOT dark/dramatic)
- DB can be queried locally using DATABASE_URL from local .env (it's valid)
- GHL_WEBHOOK_SECRET is blank in local .env — use Render for anything needing that

---

## RELATED PROJECTS (same Render account — G6-webservices)
- `zoom-transcript-relay` — Zoom Phone → GHL transcript relay. Code: `/Users/g6dev/Desktop/ZOOM PROJECT /zoom-transcript-relay`. GitHub: `smuthug6/zoom-transcript-relay`. Handles `phone.recording_transcript_completed` + `phone.caller_call_log_completed`. Transcripts working ✅. Call log payload structure still being debugged ⚠️.
- `g6-call-intelligence`, `g6-dashboards`, `sync-ghl-activity`, `utm-processor` — other G6 services, not owned by Sab.
