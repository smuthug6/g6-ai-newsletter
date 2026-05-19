const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a financial intelligence writer for De-Dollarize News. Your tone is urgent, bold, and insider-focused. You write like someone exposing what the establishment doesn't want people to know. Headlines are dramatic and direct. Summaries are 2-3 sentences, punchy, and focused on protecting wealth.`;

const TODAY = () => new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

const HEADER_HTML = (today) => `
    <!-- Header -->
    <div style="background:#1a0000;padding:32px 40px;text-align:center;border-bottom:2px solid #cc0000;">
      <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">DE-DOLLARIZE NEWS</h1>
      <p style="color:#cc0000;margin:10px 0 0;font-size:13px;letter-spacing:1px;text-transform:uppercase;font-weight:700;">While You Were Distracted</p>
      <p style="color:#666666;margin:8px 0 0;font-size:12px;">${today}</p>
    </div>

    <!-- Subheader banner -->
    <div style="background:#1a0000;padding:24px 36px;text-align:center;border-bottom:2px solid #cc0000;">
      <div style="color:#cc0000;font-size:13px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin-bottom:8px;">WHILE YOU WERE DISTRACTED</div>
      <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:-.5px;">The truth they don't want you to see</div>
    </div>`;

const FOOTER_HTML = `
    <!-- Footer -->
    <div style="background:#0a0a0a;padding:28px 40px;margin-top:32px;border-top:1px solid #cc0000;">
      <p style="color:#555555;font-size:12px;text-align:center;margin:0;line-height:1.8;">
        Protecting your wealth from the system. dedollarizenews.com<br>
        <a href="{{unsubscribe}}" style="color:#555555;">Unsubscribe</a>
      </p>
    </div>`;

// ── Utility: wrap stories in standard email shell ─────────────────────────────
function wrapHTML(bodyContent, today) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#111111;">
${HEADER_HTML(today)}

    <!-- Intro -->
    <div style="padding:32px 40px 0;">
      <p style="color:#cccccc;font-size:15px;line-height:1.7;margin:0;">The dollar is under attack. Here's what the financial press is burying — and what you need to know to protect your wealth.</p>
    </div>

${bodyContent}
${FOOTER_HTML}
  </div>
</body>
</html>`;
}

// ── Function 1: Premium newsletter (full analysis, real links) ────────────────
async function generatePremiumNewsletter(articles, topics) {
  const today = TODAY();
  const topicList = (topics || []).join(', ');

  const articleContext = articles.map((a, i) =>
    `Article ${i + 1}:\nTitle: ${a.title}\nSource: ${a.source}\nURL: ${a.url}\nSummary: ${a.summary || '(no summary)'}`
  ).join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Write the De-Dollarize News premium newsletter for ${today}.

You have these 5 curated stories:

${articleContext}

For EACH story write a deep, dramatic analysis. Return ONLY the inner story blocks — no <html>/<body> wrapper, just the repeated story divs shown below.

For each story, output this block (fill in [HEADLINE], [DEEP ANALYSIS], [SOURCE URL], [SOURCE NAME]):

    <div style="padding:24px 40px 0;">
      <div style="border-left:3px solid #cc0000;padding-left:16px;margin-bottom:32px;">
        <h2 style="color:#ffffff;font-size:17px;font-weight:700;margin:0 0 8px;line-height:1.4;">[HEADLINE]</h2>
        <p style="color:#aaaaaa;font-size:14px;line-height:1.7;margin:0 0 10px;">[DEEP ANALYSIS — 3-4 sentences, urgent, wealth-protection focused, expose the establishment angle]</p>
        <a href="[SOURCE URL]" style="color:#cc0000;font-size:12px;text-decoration:none;font-weight:700;letter-spacing:0.5px;">READ THE FULL STORY → ([SOURCE NAME])</a>
      </div>
    </div>

Output all 5 story blocks back to back. Nothing else.`
    }]
  });

  const storiesHTML = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const html = wrapHTML(storiesHTML, today);

  const subjectMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
  const firstHeadline = subjectMatch ? subjectMatch[1] : 'De-Dollarize News Alert';
  const subject = `ALERT: ${firstHeadline.substring(0, 65)}`;

  return { subject, html };
}

// ── Function 2: Free teaser newsletter (headlines + 2 sentences + CTA) ───────
async function generateFreeNewsletter(articles) {
  const today = TODAY();

  const articleContext = articles.map((a, i) =>
    `Article ${i + 1}:\nTitle: ${a.title}\nSummary: ${a.summary || '(no summary)'}`
  ).join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Write the De-Dollarize News FREE teaser newsletter for ${today}.

You have these 5 stories:

${articleContext}

For EACH story write a teaser — headline + exactly 2 punchy sentences, then cut off with "...". NO source links. Return ONLY the inner story blocks.

For each story, output this block:

    <div style="padding:24px 40px 0;">
      <div style="border-left:3px solid #cc0000;padding-left:16px;margin-bottom:32px;">
        <h2 style="color:#ffffff;font-size:17px;font-weight:700;margin:0 0 8px;line-height:1.4;">[HEADLINE]</h2>
        <p style="color:#aaaaaa;font-size:14px;line-height:1.7;margin:0;">[SENTENCE 1]. [SENTENCE 2]...</p>
      </div>
    </div>

Output all 5 teaser blocks back to back, then output this CTA block exactly as written:

    <div style="padding:24px 40px 32px;text-align:center;">
      <a href="https://dedollarizenews.com/upgrade" style="display:inline-block;background:#cc0000;color:#ffffff;text-decoration:none;padding:18px 32px;border-radius:6px;font-weight:900;font-size:15px;letter-spacing:.5px;line-height:1.5;">
        🔓 UNLOCK THE FULL INTEL<br>
        <span style="font-weight:300;font-size:13px;">Upgrade to Inner Circle →</span><br>
        <span style="font-weight:300;font-size:12px;opacity:.85;">Get the complete analysis, real sources,<br>and everything they don't want you to know</span>
      </a>
    </div>`
    }]
  });

  const storiesHTML = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const html = wrapHTML(storiesHTML, today);

  const subjectMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
  const firstHeadline = subjectMatch ? subjectMatch[1] : 'De-Dollarize News';
  const subject = `While You Were Distracted: ${firstHeadline.substring(0, 60)}`;

  return { subject, html };
}

// ── Legacy: web-search-based generation (fallback when no articles in DB) ─────
async function generateNewsletter(topics) {
  const today = TODAY();
  const topicList = topics.join(', ');

  console.log(`Generating newsletter via web search for topics: ${topicList}`);

  const searchResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{
      role: 'user',
      content: `Search for the latest news today (${today}) on these topics: ${topicList}.
      Find 5-7 of the most important, alarming, or revealing stories.
      For each story get the headline, a brief summary, and the source URL.`
    }]
  });

  const searchSummary = searchResponse.content.filter(b => b.type === 'text').map(b => b.text).join('\n');

  const newsletterResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Using the research below, write today's De-Dollarize News email newsletter.

Topics: ${topicList}
Date: ${today}

Research:
${searchSummary}

Return ONLY the inner story blocks (no html/body wrapper). For each story:

    <div style="padding:24px 40px 0;">
      <div style="border-left:3px solid #cc0000;padding-left:16px;margin-bottom:32px;">
        <h2 style="color:#ffffff;font-size:17px;font-weight:700;margin:0 0 8px;line-height:1.4;">[HEADLINE]</h2>
        <p style="color:#aaaaaa;font-size:14px;line-height:1.7;margin:0 0 10px;">[SUMMARY]</p>
        <a href="[SOURCE URL]" style="color:#cc0000;font-size:12px;text-decoration:none;font-weight:700;letter-spacing:0.5px;">READ THE FULL STORY →</a>
      </div>
    </div>

Fill in all stories. Make every headline dramatic and urgent.`
    }]
  });

  const storiesHTML = newsletterResponse.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const html = wrapHTML(storiesHTML, today);

  const subjectMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
  const firstHeadline = subjectMatch ? subjectMatch[1] : 'De-Dollarize News Alert';
  const subject = `ALERT: ${firstHeadline.substring(0, 65)}`;

  return { subject, html };
}

module.exports = { generateNewsletter, generatePremiumNewsletter, generateFreeNewsletter };
