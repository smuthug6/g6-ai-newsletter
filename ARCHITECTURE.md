# G6 AI Newsletter — System Architecture

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║                         G6 AI NEWSLETTER PLATFORM                                   ║
║                    De-Dollarize News · ai.g6platform.com                            ║
║                         Language: JavaScript (Node.js)                              ║
╚══════════════════════════════════════════════════════════════════════════════════════╝


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                              DAILY AUTOMATED PIPELINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  7:00am EDT                7:55am EDT                 8:00am EDT
  ┌─────────────┐           ┌──────────────┐           ┌──────────────────────────┐
  │  AGGREGATOR │           │ AUTO-APPROVE │           │     NEWSLETTER SEND      │
  │             │    ───►   │              │    ───►   │   FREE + PREMIUM         │
  │ Fetch RSS   │           │ Top 5 by     │           │                          │
  │ Score+Rank  │           │ score (if    │           │                          │
  │ Save to DB  │           │ not manually │           │                          │
  └─────────────┘           │ approved)    │           └──────────────────────────┘
                            └──────────────┘


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                         STEP 1 — CONTENT AGGREGATION (7am EDT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌─────────────────────────────────────────────────────────────────┐
  │                    DREAM 100 RSS FEEDS (22 sources)             │
  │                                                                 │
  │  ZeroHedge · Daily Reckoning · Sovereign Man · Breitbart       │
  │  International Man · Harry Dent · George Gammon · Kitco News   │
  │  Mises Institute · Heresy Financial · Macro Voices · Newsmax   │
  │  SRSRocco Report · Rogue Economics · Reese Report · CFACT      │
  │  Watchdog News · Remnant TV · GoldSilver · InvestAnswers       │
  │  The Money GPS · Stop World Control                            │
  └────────────────────────┬────────────────────────────────────────┘
                           │  rss-parser (npm)
                           │  Filter by 40+ financial keywords
                           ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                    GROK-3 API (xAI)                             │
  │                                                                 │
  │  "Rank these articles by virality and financial impact"         │
  │  Returns top 10 with scores (1-100) + summaries                │
  └────────────────────────┬────────────────────────────────────────┘
                           │
                           ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                 NEON DB (PostgreSQL)                             │
  │              daily_articles table                               │
  │         Saved with score, title, source, summary               │
  └─────────────────────────────────────────────────────────────────┘


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    STEP 2 — FREE NEWSLETTER GENERATION (8am EDT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌──────────────────────────────────────────────────────────────────────────────────┐
  │  FREE NEWSLETTER BUILD  (all 3 run concurrently)                                │
  │                                                                                  │
  │  ┌──────────────────┐  ┌────────────────────────┐  ┌─────────────────────────┐  │
  │  │  CLAUDE SONNET   │  │  GOOGLE IMAGEN 4       │  │  rss2json.com PROXY     │  │
  │  │  (Anthropic API) │  │  3 images generated    │  │  (bypasses Cloudflare)  │  │
  │  │                  │  │  from headline prompts │  │                         │  │
  │  │  Writes 3 punchy │  │                        │  │  Fetches 2 latest       │  │
  │  │  2-sentence      │  │  "Clean editorial      │  │  articles from          │  │
  │  │  teasers for     │  │  photography for:      │  │  dedollarizenews.com    │  │
  │  │  top 3 articles  │  │  [headline]..."        │  │  RSS feed with real     │  │
  │  │                  │  │                        │  │  featured images        │  │
  │  └────────┬─────────┘  └───────────┬────────────┘  └────────────┬────────────┘  │
  │           │                        │                             │               │
  └───────────┼────────────────────────┼─────────────────────────────┼───────────────┘
              │                        │ Upload to S3                │
              │                   ┌────▼────────────────────────┐    │
              │                   │  AWS S3 BUCKET              │    │
              │                   │  g6-newsletter-images       │    │
              │                   │  newsletter/[timestamp].png │    │
              │                   └────────────┬────────────────┘    │
              │                               │ S3 public URL        │
              ▼                               ▼                      ▼
  ┌──────────────────────────────────────────────────────────────────────────────────┐
  │                        EMAIL HTML ASSEMBLED                                      │
  │                                                                                  │
  │  ┌────────────────────────────────────────────────────────────────────────────┐  │
  │  │  De-Dollarize News Header Banner (S3 hosted)                               │  │
  │  │  Date bar                                                                  │  │
  │  │  Intro text                                                                │  │
  │  │  ─────────────────────────────────────────────────────────────────────    │  │
  │  │  [AI Image 1] Story 1 Headline + 2-sentence teaser...                     │  │
  │  │  [AI Image 2] Story 2 Headline + 2-sentence teaser...                     │  │
  │  │  [AI Image 3] Story 3 Headline + 2-sentence teaser...                     │  │
  │  │  ─────────────────────────────────────────────────────────────────────    │  │
  │  │  CTA 1 → GET OUR EXCLUSIVE DAILY ANALYSIS (offer.dedollarizenews.com)     │  │
  │  │  ─────────────────────────────────────────────────────────────────────    │  │
  │  │  WHAT YOU GET (Full Access · Email Update · Working Framework)             │  │
  │  │  ─────────────────────────────────────────────────────────────────────    │  │
  │  │  [Real Image] DDN Article 1 · Category · Title · Excerpt → Read more     │  │
  │  │  [Real Image] DDN Article 2 · Category · Title · Excerpt → Read more     │  │
  │  │  ─────────────────────────────────────────────────────────────────────    │  │
  │  │  CTA 2 → Still reading headlines? JOIN INNER CIRCLE NOW (dark bg)         │  │
  │  │  Footer / Unsubscribe                                                      │  │
  │  └────────────────────────────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────────────────────────┘


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                         STEP 3 — WHO GETS WHAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  FREE NEWSLETTER                          PREMIUM NEWSLETTER
  ┌───────────────────────────┐            ┌───────────────────────────┐
  │  GoHighLevel (GHL)        │            │  Neon DB                  │
  │                           │            │  subscribers table        │
  │  Tag: ddn-free            │            │  status = 'active'        │
  │  ~228 contacts            │            │  12 paid subscribers      │
  │                           │            │                           │
  │  Fetched via GHL API      │            │  Content from:            │
  │  (GHL_API_KEY)            │            │  dedollarizenews.com      │
  │                           │            │  WP REST API              │
  └─────────────┬─────────────┘            └─────────────┬─────────────┘
                │                                        │
                ▼                                        ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                  AWS SES (Simple Email Service)                  │
  │              From: newsletter@mail.dedollarizenews.com           │
  │              Via:  nodemailer SMTP                               │
  │              Rate: 1 email per 100ms (SES safe rate)            │
  │              Config Set: newsletter-tracking                     │
  └────────────────────────────┬────────────────────────────────────┘
                               │
                               ▼
                      📧 DELIVERED TO INBOX


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                         STEP 4 — EMAIL ANALYTICS TRACKING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Subscriber opens/clicks email
          │
          ▼
  ┌───────────────────┐        ┌──────────────────────┐        ┌─────────────────┐
  │  AWS SES          │  ───►  │  AWS SNS             │  ───►  │  Our App        │
  │  Tracks event     │        │  Publishes event     │        │  /ses-events    │
  │  open/click/      │        │  to our endpoint     │        │  endpoint       │
  │  bounce/complaint │        │                      │        │                 │
  └───────────────────┘        └──────────────────────┘        └────────┬────────┘
                                                                        │
                                                                        ▼
                                                               ┌─────────────────┐
                                                               │  Neon DB        │
                                                               │  email_events   │
                                                               │  table          │
                                                               │                 │
                                                               │  email          │
                                                               │  event_type     │
                                                               │  link clicked   │
                                                               │  tier           │
                                                               │  send_id        │
                                                               └─────────────────┘


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                              INFRASTRUCTURE & HOSTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │                                                                                 │
  │   GitHub Repo                    Render (Web Service)                           │
  │   smuthug6/g6-ai-newsletter  ──► ai.g6platform.com                             │
  │                                  Node.js v24 · npm start                       │
  │   Push to main branch            Auto-deploy on push                           │
  │   = triggers deploy              node src/index.js                             │
  │                                                                                 │
  └─────────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │  Neon DB         │  │  AWS S3          │  │  GoHighLevel     │
  │  (PostgreSQL)    │  │  g6-newsletter-  │  │  CRM             │
  │                  │  │  images bucket   │  │                  │
  │  • subscribers   │  │                  │  │  • Free list     │
  │  • newsletters   │  │  • Header images │  │    (ddn-free     │
  │  • daily_articles│  │  • AI story      │  │     tag)         │
  │  • email_events  │  │    images        │  │  • Contact data  │
  │  • oauth_tokens  │  │  • Branding      │  │  • Webhooks      │
  │                  │  │    assets        │  │                  │
  │  Scale to zero   │  │                  │  │  API Key auth    │
  │  Paid plan       │  │  us-east-1       │  │                  │
  └──────────────────┘  └──────────────────┘  └──────────────────┘


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                                  CODE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  g6-ai-newsletter/
  │
  ├── src/
  │   ├── index.js                  Entry point · Express server · Cron wiring
  │   ├── supabase.js               Neon DB connection (pg Pool)
  │   ├── newsletter.js             Claude + Imagen · Build email HTML
  │   ├── email.js                  AWS SES SMTP · sendBulk()
  │   ├── ghl.js                    GoHighLevel API · getContactsByTag()
  │   ├── wordpressFetcher.js       WP REST API + rss2json proxy for DDN articles
  │   │
  │   ├── jobs/
  │   │   ├── dailyNewsletter.js    Main cron jobs · runDailyNewsletter()
  │   │   └── contentAggregator.js  Dream 100 RSS · Grok ranking · Save to DB
  │   │
  │   └── routes/
  │       ├── admin.js              Admin API · stats/subscribers/send/preview
  │       ├── webhook.js            GHL webhook · subscribe/cancel events
  │       ├── oauth.js              GHL OAuth · token storage
  │       └── sesEvents.js          AWS SNS · email event tracking
  │
  ├── public/
  │   └── admin.html                Admin dashboard UI (single page)
  │
  ├── package.json                  Dependencies
  └── render.yaml                   Render deployment config


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                               TECH STACK SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  LANGUAGE         JavaScript (Node.js v24)

  FRAMEWORK        Express.js         Web server + API routes
  SCHEDULER        node-cron          Daily automated jobs
  DB CLIENT        pg (node-postgres) Neon PostgreSQL connection
  HTTP CLIENT      axios              GHL API calls
  RSS PARSER       rss-parser         Dream 100 feed parsing
  EMAIL            nodemailer         SES SMTP delivery

  AI SERVICES
  ├── Anthropic Claude Sonnet 4.6    Newsletter writing + summaries
  ├── xAI Grok-3                     Content ranking + virality scoring
  └── Google Imagen 4                Story image generation

  AWS SERVICES
  ├── SES (Simple Email Service)     Email delivery
  ├── SNS (Simple Notification Svc)  Email event webhooks
  └── S3                             Image hosting

  EXTERNAL PLATFORMS
  ├── GoHighLevel (GHL)              CRM + contact management
  ├── Neon                           Serverless PostgreSQL
  ├── Render                         App hosting + deployment
  ├── GitHub (smuthug6)              Source code + version control
  └── rss2json.com                   RSS proxy (bypasses Cloudflare)

  DATABASE TABLES
  ├── subscribers       Paid premium contacts (12 active)
  ├── newsletters       Log of every send (subject/tier/sent_to/send_id)
  ├── daily_articles    Daily content queue (Dream 100 + Grok scores)
  ├── email_events      Open/click/bounce tracking per email
  └── oauth_tokens      GHL OAuth token storage


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                              ADMIN DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  https://ai.g6platform.com

  ┌─────────────────────────────────────────────────────────────────┐
  │  Stats        Active/frozen subscribers · Recent sends          │
  │  Content      Today's articles · Approve/remove/reorder         │
  │  Preview      Generate live preview of free or premium email    │
  │  Send         Send free only · Send premium only · Send both    │
  │  Subscribers  View/freeze/activate premium contacts             │
  │  Analytics    Opens/clicks/bounces per newsletter               │
  └─────────────────────────────────────────────────────────────────┘
```
