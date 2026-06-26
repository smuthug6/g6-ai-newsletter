const Anthropic = require('@anthropic-ai/sdk');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { fetchRecentDDNArticles } = require('./wordpressFetcher');

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

async function generateStoryImage(headline) {
  if (!process.env.GOOGLE_AI_KEY) return null;
  try {
    const imagePrompt = `Dramatic financial news illustration for headline: "${headline}". Dark moody atmosphere, deep crimson and gold color palette, cinematic dramatic lighting, photorealistic editorial photography style, no text, no logos, no people, no faces`;
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
    if (!b64) console.warn(`Imagen: no image for "${headline}". Response: ${JSON.stringify(data).slice(0, 200)}`);
    return b64;
  } catch (err) {
    console.error(`Imagen failed for "${headline}": ${err.message}`);
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

const PREMIUM_HEADER_HTML = (today) => `
    <!-- Header image -->
    <div style="margin:0;padding:0;">
      <img src="https://g6-newsletter-images.s3.us-east-1.amazonaws.com/branding/inner-circle-header.png" style="width:100%;display:block;" alt="De-Dollarize News Inner Circle">
    </div>

    <!-- Date bar -->
    <div style="background:#cc0000;padding:10px 40px;text-align:center;">
      <p style="color:#ffcccc;margin:0;font-size:12px;letter-spacing:.05em;">${today}</p>
    </div>`;

const FREE_HEADER_HTML = (today) => `
    <!-- Header image -->
    <div style="margin:0;padding:0;">
      <img src="https://g6-newsletter-images.s3.us-east-1.amazonaws.com/branding/free-newsletter-header.png" style="width:100%;display:block;" alt="De-Dollarize News">
    </div>

    <!-- Date bar -->
    <div style="background:#cc0000;padding:10px 40px;text-align:center;">
      <p style="color:#ffcccc;margin:0;font-size:12px;letter-spacing:.05em;">${today}</p>
    </div>`;

const FOOTER_HTML = `
    <!-- Footer -->
    <div style="background:#f5f5f5;padding:28px 40px;margin-top:32px;border-top:3px solid #cc0000;">
      <p style="color:#888888;font-size:12px;text-align:center;margin:0;line-height:1.8;">
        Protecting your wealth from the system. dedollarizenews.com<br>
        <a href="https://sites.leadconnectorhq.com/preview/iWCmwhl0MwsTeCHsEUqp?notrack=true" style="color:#cc0000;text-decoration:none;">Unsubscribe</a>
      </p>
    </div>`;

function wrapHTML(bodyContent, today, headerHtml) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
${headerHtml}

    <!-- Intro -->
    <div style="padding:28px 40px 0;border-bottom:2px solid #f0f0f0;margin-bottom:8px;">
      <p style="color:#444444;font-size:15px;line-height:1.7;margin:0 0 20px;">The dollar is under attack. Here's what the financial press is burying — and what you need to know to protect your wealth.</p>
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
    model: 'claude-sonnet-4-6',
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
    return `
    <div style="padding:24px 40px 0;">
      ${imageHtml}
      <div style="border-left:3px solid #cc0000;padding-left:16px;margin-bottom:32px;${article.imageUrl ? 'padding-top:12px;' : ''}">
        <h2 style="color:#1a1a1a;font-size:17px;font-weight:700;margin:0 0 8px;line-height:1.4;">${article.title}</h2>
        <p style="color:#555555;font-size:14px;line-height:1.7;margin:0 0 10px;">${summary}</p>
        <a href="${article.url}" style="color:#cc0000;font-size:12px;text-decoration:none;font-weight:700;letter-spacing:0.5px;">READ THE FULL ANALYSIS →</a>
      </div>
    </div>`;
  }).join('\n');

  const html = wrapHTML(storiesHTML, today, PREMIUM_HEADER_HTML(today));

  // Subject: first article (most recent from WP, ordered newest-first)
  const subject = `Inner Circle: ${articles[0].title.substring(0, 65)}`;

  return { subject, html };
}

// ── Function 2: Free teaser — 3 stories + images + DDN articles + 2 CTAs ──────
async function generateFreeNewsletter(articles) {
  const today = TODAY();

  const articleContext = articles.map((a, i) =>
    `Article ${i + 1}:\nTitle: ${a.title}\nSummary: ${a.excerpt || a.summary || '(no summary)'}`
  ).join('\n\n');

  // Run Claude, 3 Imagen images, and DDN RSS fetch all concurrently
  const [response, imageUrls, ddnArticles] = await Promise.all([
    client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Write the De-Dollarize News FREE teaser newsletter for ${today}.

You have these ${articles.length} stories:

${articleContext}

For EACH story write a teaser — headline + exactly 2 punchy sentences, then cut off with "...". NO source links. Return ONLY the story blocks, nothing else.

For each story output this exact block:

    <div style="padding:24px 40px 0;">
      <div style="border-left:3px solid #cc0000;padding-left:16px;margin-bottom:32px;">
        <h2 style="color:#1a1a1a;font-size:17px;font-weight:700;margin:0 0 8px;line-height:1.4;">[HEADLINE]</h2>
        <p style="color:#555555;font-size:14px;line-height:1.7;margin:0;">[SENTENCE 1]. [SENTENCE 2]...</p>
      </div>
    </div>`,
      }],
    }),
    // Generate 3 images from top 3 headlines
    (async () => {
      const urls = [];
      for (let i = 0; i < 3; i++) {
        const headline = articles[i]?.title || `Story ${i + 1}`;
        const b64 = await generateStoryImage(headline);
        if (b64) {
          try { urls.push(await uploadToS3(b64)); } catch (e) { console.error('S3 upload failed:', e.message); urls.push(null); }
        } else {
          urls.push(null);
        }
        if (i < 2) await new Promise(r => setTimeout(r, 3000));
      }
      return urls;
    })(),
    // Fetch 2 recent articles from dedollarizenews.com via RSS
    fetchRecentDDNArticles(2).catch(e => { console.error('DDN RSS failed:', e.message); return []; }),
  ]);

  const rawStoriesHTML = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const storiesHTML = injectImageUrls(rawStoriesHTML, imageUrls);

  const cta1HTML = `
    <div style="padding:32px 40px;text-align:center;background:#f9f9f9;margin-top:8px;border-top:3px solid #cc0000;">
      <p style="color:#cc0000;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">MEMBERS ONLY</p>
      <a href="https://offer.dedollarizenews.com/inner-circle-sale/" style="display:inline-block;background:#cc0000;color:#ffffff;text-decoration:none;padding:20px 36px;border-radius:6px;font-weight:900;font-size:16px;letter-spacing:.5px;line-height:1.6;">
        GET OUR EXCLUSIVE DAILY ANALYSIS →<br>
        <span style="font-weight:400;font-size:13px;opacity:.9;">Subscribe to Inner Circle for dedollarizenews.com<br>premium content delivered daily</span>
      </a>
      <p style="color:#999999;font-size:12px;margin:16px 0 0;">Full analysis · Real sources · Wealth protection strategies</p>
    </div>`;

  const whatYouGetHTML = `
    <div style="padding:28px 40px;background:#ffffff;border-top:1px solid #e8e8e8;">
      <p style="color:#cc0000;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 16px;">What you get</p>
      <p style="font-size:14px;color:#333333;line-height:1.7;margin:0 0 10px;">➡️ <strong>Full Access to <a href="https://www.dedollarizenews.com" style="color:#cc0000;text-decoration:none;">dedollarizenews.com</a></strong> — the running record of what the dollar is doing and who's moving away from it.</p>
      <p style="font-size:14px;color:#333333;line-height:1.7;margin:0 0 10px;">➡️ <strong>Email Update</strong> when the story moves — central bank shifts, gold flows, policy turns. No filler.</p>
      <p style="font-size:14px;color:#333333;line-height:1.7;margin:0;">➡️ <strong>A working framework</strong> for reading dollar news the way the people watching it actually do.</p>
    </div>`;

  const ddnHTML = ddnArticles.length > 0 ? `
    <div style="padding:0 40px;border-top:1px solid #e8e8e8;">
      ${ddnArticles.map(a => `
      <div style="padding:20px 0;border-bottom:1px solid #e8e8e8;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            ${a.imageUrl ? `<td width="140" style="vertical-align:top;padding-right:16px;">
              <img src="${a.imageUrl}" width="140" style="display:block;width:140px;height:93px;object-fit:cover;border-radius:4px;" alt="">
            </td>` : ''}
            <td style="vertical-align:top;">
              <p style="color:#cc0000;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 5px;">${a.category}</p>
              <p style="color:#1a1a1a;font-size:15px;font-weight:700;margin:0 0 6px;line-height:1.35;">${a.title}</p>
              <p style="color:#666666;font-size:13px;line-height:1.5;margin:0 0 8px;">${a.excerpt}...</p>
              <a href="${a.url}" style="color:#cc0000;font-size:12px;font-weight:700;text-decoration:none;letter-spacing:0.3px;">Read the full story →</a>
            </td>
          </tr>
        </table>
      </div>`).join('')}
    </div>` : '';

  const cta2HTML = `
    <div style="padding:36px 40px;text-align:center;background:#0d0d0d;margin-top:0;">
      <p style="color:#cc0000;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">THE DOLLAR ISN'T WAITING</p>
      <p style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;line-height:1.3;">Still reading headlines?</p>
      <p style="color:#aaaaaa;font-size:15px;margin:0 0 24px;line-height:1.5;">Start reading what's <em>behind</em> them.</p>
      <a href="https://offer.dedollarizenews.com/inner-circle-sale/" style="display:inline-block;background:#cc0000;color:#ffffff;text-decoration:none;padding:18px 40px;border-radius:6px;font-weight:900;font-size:15px;letter-spacing:.5px;">
        JOIN INNER CIRCLE NOW →
      </a>
      <p style="color:#555555;font-size:11px;margin:20px 0 0;">Join thousands protecting their wealth from the coming reset.</p>
    </div>`;

  const bodyContent = storiesHTML + cta1HTML + whatYouGetHTML + ddnHTML + cta2HTML;
  const html = wrapHTML(bodyContent, today, FREE_HEADER_HTML(today));

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
    model: 'claude-sonnet-4-6',
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
    model: 'claude-sonnet-4-6',
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
  const html = wrapHTML(storiesHTML, today, PREMIUM_HEADER_HTML(today));

  const subjectMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
  const firstHeadline = subjectMatch ? subjectMatch[1] : 'De-Dollarize News Alert';
  const subject = `Inner Circle: ${firstHeadline.substring(0, 65)}`;

  return { subject, html };
}

module.exports = { generateNewsletter, generatePremiumNewsletter, generateFreeNewsletter };
