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
- **Recipients:** GHL contacts tagged `ddn-free` (~9,000–10,000 contacts)
- **GHL API hard cap:** GHL pagination caps at 10,000 contacts (page 101 returns 400). List has grown past 10k — anyone beyond 10k won't get the email until this is resolved.
- **Content:** Top 3 Dream 100 teasers + AI images + 2 DDN articles + 2 CTAs
- **Send:** Manual only via admin dashboard (no cron). Batches into 4 sends over 90 minutes.

### EVENING NEWSLETTER
- **Recipients:** Same `ddn-free` GHL list
- **Content:** "While You Were Distracted" — 3 today's DDN articles, Claude curiosity paragraphs, banking article promoted to #1
- **Send:** Manual only. Sends all at once (~16 min for 10k contacts). Gracefully skips if no new DDN articles today.

### PREMIUM NEWSLETTER (Inner Circle)
- **Recipients:** ~43–47 active subscribers in Neon DB (tagged `ddn-inner-circle` in GHL)
- **Content:** Latest Inner Circle article + Claude writes 2 paragraphs. No em dashes (—).
- **Send:** Manual only via admin dashboard. Skips weekends only when using "Send Both" — manual "Send Premium Only" sends any day.

---

## CRON SCHEDULE (all UTC — NO send crons, all sends are manual)
```
11:00am UTC (7:00am EDT)  — Content aggregator: Dream 100 RSS → Grok-3 ranks → saves top 10 to daily_articles
11:55am UTC (7:55am EDT)  — Auto-approve top 5 if none manually approved
3:00am UTC  (11:00pm EDT) — Nightly bounce/complaint/soft-bounce cleanup
```
**Important:** Morning, evening, and premium sends were all removed from cron. Everything is manual via the dashboard.

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

| Action | Tag Added | Tag Removed |
|--------|-----------|-------------|
| Click any content/CTA link | `clicked-ddn-free` | — |
| Click unsubscribe link | (excluded — no tag) | — |
| Unsubscribe (clicks our page) | `unsubscribed-ddn-free` | `ddn-free`, `ddn-inner-circle` |
| Complaint (spam report) | `complained-ddn-free` | `ddn-free` |
| Hard bounce (Permanent) | `bounced-ddn-free` | `ddn-free` |
| Soft bounce (3+ times) | `soft-bounced-ddn-free` | `ddn-free` |

**Send list tags:**
- `ddn-free` — who gets free + evening newsletter (pulled via GHL API)
- `ddn-inner-circle` — who gets premium (but we pull from Neon DB subscribers table, not GHL tag)

---

## BOUNCE / COMPLAINT / UNSUBSCRIBE HANDLING

### Real-time (sesEvents.js — fires immediately on SES event):
- **Hard bounce** → removes `ddn-free`, adds `bounced-ddn-free` in GHL
- **Complaint** → removes `ddn-free`, adds `complained-ddn-free` in GHL
- **Click** (non-unsubscribe links) → adds `clicked-ddn-free` in GHL
- Unsubscribe link clicks excluded from `clicked-ddn-free` (filtered by link containing "unsubscribe")

### Nightly cleanup at 11pm EDT (runBounceCleanup()):
- Hard bounces + complaints from last 24h → same GHL tag actions (safety net if real-time failed)
- Premium hard bounces/complaints → freeze in Neon DB
- **Soft bounces (3+ total)** → removes `ddn-free`, adds `soft-bounced-ddn-free` (checks all-time count)

### Unsubscribe (self-hosted /unsubscribe route — real-time on page visit):
- Removes `ddn-free` + `ddn-inner-circle` from GHL
- Adds `unsubscribed-ddn-free` to GHL
- Freezes in Neon DB if premium subscriber
- Logs event to email_events WITH send_id (send_id now embedded in unsubscribe URL)

### Soft bounces:
- Single soft bounce = ignored (temporary — full inbox, server down etc.)
- 3+ soft bounces = removed from list via nightly cleanup
- One-time cleanup already ran Aug 3 2026 — removed 461 repeat soft bouncers

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
- **Open rates declining**: Was 6-9% in Aug, dropped to 3-5% in Sep
- **Bounce rates increasing**: 0.3-0.75% in Aug → 1.57-1.75% in Sep (SES danger threshold: 5%)
- **Hard bounce spike**: Sep 17 had 39 hard bounces in one send (normal is 0-6) — suspicious batch of bad emails
- **Complaint rate**: ~9 complaints in last 7 days — SES threshold is 0.08% (7 complaints on 8,500 send)
- **Root cause**: Rapid list growth (2k → 10k) brought in many low-quality/invalid emails
- **List shrinking**: 9,970 → ~8,800 as bounces/complaints are cleaned out
- **Previous platform (Daily AI)**: Was sending to ~54k contacts (33k active + 21k activating) with 23-48% open rates. Contacted them Sep 2026 to request list export segmented by active/activating.

---

## UNSUBSCRIBE SYSTEM
- Self-hosted at `GET /unsubscribe?email=xxx&sig=xxx&send_id=xxx`
- HMAC-SHA256 signed with GHL_WEBHOOK_SECRET (first 16 chars of hex)
- send_id now embedded in URL so unsubscribes link to the correct newsletter in analytics
- Shows branded confirmation page

---

## GHL SETUP
- Free list: contacts tagged `ddn-free` (GHL API caps at 10,000 contacts — page 101 returns 400)
- Premium list: contacts tagged `ddn-inner-circle` (but pulled from Neon DB, not GHL)
- GHL webhook at `/webhook/ghl`: event=subscribe adds/reactivates in DB, event=cancel freezes
- GHL API key: static private integration key (doesn't expire)
- GHL trigger links don't work with SES sends — that's why we built self-hosted unsubscribe

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

## IMPORTANT BUGS FIXED (full history)
- Neon DB 4-min ping removed (was burning free compute quota)
- Claude model updated from `claude-sonnet-4-20250514` (retired) to `claude-sonnet-4-6`
- Anthropic SDK upgraded from 0.24 to 0.105
- GHL OAuth tokens expired → switched to static GHL_API_KEY
- WP REST API 403 (Cloudflare blocks Render IPs) → switched to rss2json proxy
- Duplicate aggregator cron removed from index.js
- DB connection timeout increased to 60s + wake-up ping before aggregator
- Morning + evening send crons removed — all sends are now manual
- One-time soft bounce cleanup ran Aug 3 2026 — removed 461 repeat bouncers

## CHANGES MADE Sep 2026 (this session)
- `sesEvents.js`: Real-time complaint + hard bounce GHL tag removal (no more waiting for nightly cleanup)
- `sesEvents.js`: Real-time `clicked-ddn-free` tag on email link clicks (unsubscribe links excluded)
- `unsubscribe.js`: Added `unsubscribed-ddn-free` tag to GHL on unsubscribe
- `email.js`: Embedded `send_id` in unsubscribe URL so analytics shows unsubscribes per newsletter
- `unsubscribe.js`: Logs unsubscribe event with `send_id` to email_events
- `admin.js`: Analytics clicks column now excludes unsubscribe link clicks (NOT LIKE '%unsubscribe%')
- `dailyNewsletter.js`: Added ongoing soft bounce cleanup to nightly job — 3+ soft bounces → remove `ddn-free`, add `soft-bounced-ddn-free`

---

## OPEN ITEMS / NEXT STEPS
- **GHL 10k contact cap**: Need to fix getContactsByTag() to handle lists over 10,000 (page 101 returns 400, currently stops at 10k)
- **Deliverability**: Open rates dropped 3-5%, bounce rates climbing. Need to improve list quality.
- **Daily AI list import**: Contacted Daily AI Sep 2026 to request export of ~54k contacts (33k active + 21k activating). Once received, plan to import active list into GHL carefully.
- **SES daily quota increase**: Needed before scaling to 50k+ contacts (current limit 50k/day)
- **Render auto-deploy**: Not configured — manual deploy required after every push

---

## NOTES / PREFERENCES
- Sab prefers concise answers — don't over-explain
- Always ask before pushing to GitHub if it's not a clear bug fix or feature
- Never add em dashes (—) in newsletter content
- The word "Unsubscribe" in emails should always be small and subtle gray (not red)
- Image prompts for free newsletter: clean editorial photography, bright natural lighting (NOT dark/dramatic)
- DB can be queried locally using DATABASE_URL from local .env (it's valid)
- GHL_WEBHOOK_SECRET is blank in local .env — use Render for anything needing that
