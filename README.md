# G6 AI Newsletter App

A Node.js app that integrates GHL + Claude AI + Supabase to power a daily AI newsletter with Stripe-based access control.

## How it works

1. **Subscriber pays** on your WordPress/Stripe page
2. **Stripe fires a webhook** to GHL (you already have this)
3. **GHL workflow** calls our app at `POST /webhook/ghl` with `{ event: "subscribe", email, full_name, ghl_contact_id }`
4. **App creates/activates** the user in Supabase
5. **Every morning at 8am UTC**, Claude generates a fresh newsletter using web search
6. **App sends via GHL API** to all active subscribers
7. **On cancel**, GHL calls `POST /webhook/ghl` with `{ event: "cancel", email }` → user is frozen

---

## Setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase_setup.sql`
3. Copy your **Project URL** and **service_role key** from Settings → API

### 2. Anthropic API key

Get one at [console.anthropic.com](https://console.anthropic.com)

### 3. GHL API key

In GHL: Settings → Integrations → API → copy your **API key** and **Location ID**

### 4. Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Render will detect `render.yaml` automatically
5. Add these **Environment Variables** in Render dashboard:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `GHL_API_KEY` | Your GHL API key |
| `GHL_LOCATION_ID` | Your GHL location ID |
| `GHL_WEBHOOK_SECRET` | Make up a random secret string |
| `NEWSLETTER_TOPICS` | e.g. `AI tools,ChatGPT,AI agents,automation` |
| `CRON_SCHEDULE` | `0 8 * * *` (8am UTC daily) |

6. Deploy — your app will be live at `https://your-app.onrender.com`

### 5. Configure GHL Workflows

Create **two workflows** in GHL:

#### Workflow 1 — Subscription created
- Trigger: Stripe subscription created (or contact tag added)
- Action: HTTP Request
  - URL: `https://your-app.onrender.com/webhook/ghl`
  - Method: POST
  - Headers: `x-ghl-secret: YOUR_GHL_WEBHOOK_SECRET`
  - Body (JSON):
    ```json
    {
      "event": "subscribe",
      "email": "{{contact.email}}",
      "full_name": "{{contact.full_name}}",
      "ghl_contact_id": "{{contact.id}}"
    }
    ```

#### Workflow 2 — Subscription cancelled
- Trigger: Stripe subscription cancelled (or contact tag removed)
- Action: HTTP Request
  - URL: `https://your-app.onrender.com/webhook/ghl`
  - Method: POST
  - Headers: `x-ghl-secret: YOUR_GHL_WEBHOOK_SECRET`
  - Body (JSON):
    ```json
    {
      "event": "cancel",
      "email": "{{contact.email}}"
    }
    ```

---

## Admin Dashboard

Visit `https://your-app.onrender.com` and enter your `GHL_WEBHOOK_SECRET` as the admin token.

From the dashboard you can:
- See active vs frozen subscriber counts
- Browse the subscriber list
- Preview today's newsletter before it sends
- Manually trigger a send
- Freeze or reactivate individual subscribers

---

## Newsletter Topics

Edit the `NEWSLETTER_TOPICS` environment variable in Render:
```
AI tools,ChatGPT updates,AI agents,automation,AI in business
```

Claude will search the web for the latest news on each topic and write a fresh newsletter every morning.

---

## File structure

```
src/
  index.js              — Express server entry point
  supabase.js           — Supabase client
  newsletter.js         — Claude AI newsletter generator
  ghl.js                — GHL email sender
  routes/
    webhook.js          — POST /webhook/ghl
    admin.js            — Admin API endpoints
  jobs/
    dailyNewsletter.js  — Cron job (runs at 8am UTC)
public/
  admin.html            — Admin dashboard UI
supabase_setup.sql      — Run once to set up DB tables
render.yaml             — Render deployment config
.env.example            — Copy to .env for local dev
```
