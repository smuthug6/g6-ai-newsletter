const Anthropic = require('@anthropic-ai/sdk');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const s3 = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
  },
});

async function uploadToS3(base64Image) {
  const key = `newsletter/${Date.now()}.png`;
  await s3.send(new PutObjectCommand({
    Bucket: 'g6-newsletter-images',
    Key: key,
    Body: Buffer.from(base64Image, 'base64'),
    ContentType: 'image/png',
  }));
  return `https://g6-newsletter-images.s3.us-east-1.amazonaws.com/${key}`;
}

// ── Google Imagen 4 — used ONLY for free teaser newsletter ───────────────────
const IMAGE_THEMES = [
  'Gold bars stacked on a dark surface, dramatic side lighting, crimson reflections, photorealistic editorial photography, no text, no people',
  'Crumbling stone pillars with gold coins scattered at their base, dark moody atmosphere, high contrast, photorealistic, no text, no people',
  'Abstract financial market data visualized as glowing lines descending into darkness, crimson and gold tones, no text, no people',
  'Stack of worn dollar bills on black marble, single spotlight, deep shadows, photorealistic editorial photography, no text, no people',
  'Old bank vault door slightly open revealing darkness inside, gold and crimson tones, cinematic lighting, no text, no people',
  'Shattered US dollar bill fragments against black background, dramatic lighting, gold tones, no text, no people',
  'Pile of gold coins overflowing from a cracked safe, dark background, crimson lighting, no text, no people',
];

async function generateStoryImage(index = 0) {
  if (!process.env.GOOGLE_AI_KEY) return null;
  try {
    const imagePrompt = IMAGE_THEMES[index % IMAGE_THEMES.length];
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GOOGLE_AI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: imagePrompt }],
          parameters: { sampleCount: 1, aspectRatio: '16:9' },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const b64 = data?.predictions?.[0]?.bytesBase64Encoded || null;
    if (!b64) console.warn(`Imagen: no image data for index ${index}. Response: ${JSON.stringify(data).slice(0, 200)}`);
    return b64;
  } catch (err) {
    console.error(`Imagen failed (index ${index}): ${err.message}`);
    return null;
  }
}

// Inject S3-hosted image URLs above the first N <h2> tags
function injectImageUrls(storiesHTML, urls) {
  let idx = 0;
  return storiesHTML.replace(/<h2 /g, (match) => {
    const url = urls[idx++];
    if (!url) return match;
    return `<img src="${url}" style="width:100%;height:220px;object-fit:cover;margin-bottom:16px;border-radius:4px;display:block;" alt="">\n    ${match}`;
  });
}

const SYSTEM_PROMPT = `You are a financial intelligence writer for De-Dollarize News. Your tone is urgent, bold, and insider-focused. You write like someone exposing what the establishment doesn't want people to know. Headlines are dramatic and direct. Summaries are 2-3 sentences, punchy, and focused on protecting wealth.`;

const TODAY = () => new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
});

const HEADER_HTML = (today) => `
    <!-- Header -->
    <div style="background:#cc0000;padding:32px 40px;text-align:center;border-bottom:3px solid #990000;">
      <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">DE-DOLLARIZE NEWS</h1>
      <p style="color:#ffcccc;margin:10px 0 0;font-size:13px;letter-spacing:1px;text-transform:uppercase;font-weight:700;">While You Were Distracted</p>
      <p style="color:#ffaaaa;margin:8px 0 0;font-size:12px;">${today}</p>
    </div>

    <!-- Subheader banner -->
    <div style="background:#1a1a1a;padding:20px 36px;text-align:center;border-bottom:1px solid #e0e0e0;">
      <div style="color:#cc0000;font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin-bottom:6px;">WHILE YOU WERE DISTRACTED</div>
      <div style="color:#ffffff;font-size:20px;font-weight:900;letter-spacing:-.5px;">The truth they don't want you to see</div>
    </div>`;

const FOOTER_HTML = `
    <!-- Footer -->
    <div style="background:#f5f5f5;padding:28px 40px;margin-top:32px;border-top:3px solid #cc0000;">
      <p style="color:#888888;font-size:12px;text-align:center;margin:0;line-height:1.8;">
        Protecting your wealth from the system. dedollarizenews.com<br>
        <a href="https://dedollarizenews.com/unsubscribe" style="color:#cc0000;text-decoration:none;">Unsubscribe</a>
      </p>
    </div>`;

function wrapHTML(bodyContent, today) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
${HEADER_HTML(today)}

    <!-- Intro -->
    <div style="padding:32px 40px 0;">
      <p style="color:#444444;font-size:15px;line-height:1.7;margin:0;">The dollar is under attack. Here's what the financial press is burying — and what you need to know to protect your wealth.</p>
    </div>

${bodyContent}
${FOOTER_HTML}
  </div>
</body>
</html>`;
}

// ── Extract JSON array from Claude response (handles code block wrappers) ─────
function extractJSONArray(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
  }
  return null;
}

// ── Function 1: Premium newsletter — WP featured images, Claude summaries ─────
// articles: [{ title, excerpt, url, imageUrl, publishedTime, source }]
async function generatePremiumNewsletter(articles, _topics) {
  const today = TODAY();

  const articleContext = articles.map((a, i) =>
    `Article ${i + 1}:\nTitle: ${a.title}\nExcerpt: ${a.excerpt || a.summary || '(no excerpt)'}`
  ).join('\n\n');

  // Claude writes only the summary text — we build the HTML
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Write a 2-3 sentence urgent, wealth-protection email summary for each article below. Expose what the establishment is hiding. Make readers feel the urgency to act now.

${articleContext}

Return ONLY a valid JSON array of strings — one summary per article, in order. No other text.
["Summary 1...", "Summary 2...", ...]`,
    }],
  });

  const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const summaries = extractJSONArray(rawText) || [];

  // Build story blocks — WP featured image above each story card
  const storiesHTML = articles.map((article, i) => {
    const summary = typeof summaries[i] === 'string' ? summaries[i] : (article.excerpt || article.summary || '');
    const imageHtml = article.imageUrl
      ? `<img src="${article.imageUrl}" style="width:100%;height:220px;object-fit:cover;display:block;margin-bottom:0;border-radius:4px 4px 0 0;" alt="">`
      : '';
    const timeHtml = article.publishedTime
      ? `<p style="color:#cc0000;font-size:11px;font-weight:700;letter-spacing:0.5px;margin:0 0 6px;text-transform:uppercase;">${article.publishedTime}</p>`
      : '';

    return `
    <div style="padding:24px 40px 0;">
      ${imageHtml}
      <div style="border-left:3px solid #cc0000;padding-left:16px;margin-bottom:32px;${article.imageUrl ? 'padding-top:12px;' : ''}">
        ${timeHtml}
        <h2 style="color:#1a1a1a;font-size:17px;font-weight:700;margin:0 0 8px;line-height:1.4;">${article.title}</h2>
        <p style="color:#555555;font-size:14px;line-height:1.7;margin:0 0 10px;">${summary}</p>
        <a href="${article.url}" style="color:#cc0000;font-size:12px;text-decoration:none;font-weight:700;letter-spacing:0.5px;">READ THE FULL ANALYSIS →</a>
      </div>
    </div>`;
  }).join('\n');

  const html = wrapHTML(storiesHTML, today);

  // Subject: first article (most recent from WP, ordered newest-first)
  const subject = `ALERT: ${articles[0].title.substring(0, 65)}`;

  return { subject, html };
}

// ── Function 2: Free teaser — Imagen images, 2-sentence teasers + CTA ────────
async function generateFreeNewsletter(articles) {
  const today = TODAY();

  const articleContext = articles.map((a, i) =>
    `Article ${i + 1}:\nTitle: ${a.title}\nSummary: ${a.excerpt || a.summary || '(no summary)'}`
  ).join('\n\n');

  // Run Claude and Imagen (1 image only) concurrently
  const [response, imageUrls] = await Promise.all([
    client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Write the De-Dollarize News FREE teaser newsletter for ${today}.

You have these ${articles.length} stories:

${articleContext}

For EACH story write a teaser — headline + exactly 2 punchy sentences, then cut off with "...". NO source links. Return ONLY the inner story blocks.

For each story, output this block:

    <div style="padding:24px 40px 0;">
      <div style="border-left:3px solid #cc0000;padding-left:16px;margin-bottom:32px;">
        <h2 style="color:#1a1a1a;font-size:17px;font-weight:700;margin:0 0 8px;line-height:1.4;">[HEADLINE]</h2>
        <p style="color:#555555;font-size:14px;line-height:1.7;margin:0;">[SENTENCE 1]. [SENTENCE 2]...</p>
      </div>
    </div>

Output all ${articles.length} teaser blocks back to back, then output this CTA block exactly as written:

    <div style="padding:32px 40px;text-align:center;background:#f9f9f9;margin-top:8px;border-top:3px solid #cc0000;">
      <p style="color:#cc0000;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">MEMBERS ONLY</p>
      <a href="https://offer.dedollarizenews.com/inner-circle-sale/" style="display:inline-block;background:#cc0000;color:#ffffff;text-decoration:none;padding:20px 36px;border-radius:6px;font-weight:900;font-size:16px;letter-spacing:.5px;line-height:1.6;">
        GET OUR EXCLUSIVE DAILY ANALYSIS →<br>
        <span style="font-weight:400;font-size:13px;opacity:.9;">Subscribe to Inner Circle for dedollarizenews.com<br>premium content delivered daily</span>
      </a>
      <p style="color:#999999;font-size:12px;margin:16px 0 0;">Full analysis · Real sources · Wealth protection strategies</p>
    </div>`,
      }],
    }),
    // Generate 2 images sequentially and upload to S3
    (async () => {
      const urls = [];
      for (let i = 0; i < 2; i++) {
        const b64 = await generateStoryImage(i);
        if (b64) {
          try { urls.push(await uploadToS3(b64)); } catch (e) { console.error('S3 upload failed:', e.message); urls.push(null); }
        } else {
          urls.push(null);
        }
        if (i === 0) await new Promise(r => setTimeout(r, 3000));
      }
      return urls;
    })(),
  ]);

  const rawStoriesHTML = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const storiesHTML = injectImageUrls(rawStoriesHTML, imageUrls);
  const html = wrapHTML(storiesHTML, today);

  const subjectMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
  const firstHeadline = subjectMatch ? subjectMatch[1] : 'De-Dollarize News';
  const subject = `While You Were Distracted: ${firstHeadline.substring(0, 60)}`;

  return { subject, html };
}

// ── Legacy: web-search-based generation (used in admin preview fallback) ──────
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
      content: `Search for the latest news today (${today}) on these topics: ${topicList}. Find 5-7 of the most important, alarming, or revealing stories. For each story get the headline, a brief summary, and the source URL.`,
    }],
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
        <h2 style="color:#1a1a1a;font-size:17px;font-weight:700;margin:0 0 8px;line-height:1.4;">[HEADLINE]</h2>
        <p style="color:#555555;font-size:14px;line-height:1.7;margin:0 0 10px;">[SUMMARY]</p>
        <a href="[SOURCE URL]" style="color:#cc0000;font-size:12px;text-decoration:none;font-weight:700;letter-spacing:0.5px;">READ THE FULL STORY →</a>
      </div>
    </div>

Fill in all stories. Make every headline dramatic and urgent.`,
    }],
  });

  const storiesHTML = newsletterResponse.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const html = wrapHTML(storiesHTML, today);

  const subjectMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
  const firstHeadline = subjectMatch ? subjectMatch[1] : 'De-Dollarize News Alert';
  const subject = `ALERT: ${firstHeadline.substring(0, 65)}`;

  return { subject, html };
}

module.exports = { generateNewsletter, generatePremiumNewsletter, generateFreeNewsletter };
