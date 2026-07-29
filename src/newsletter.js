const Anthropic = require('@anthropic-ai/sdk');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { fetchRecentDDNArticles, fetchEveningDDNArticles } = require('./wordpressFetcher');

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
    const imagePrompt = `Clean editorial photography for financial news headline: "${headline}". Bright natural lighting, neutral white or light background, modern professional magazine style, sharp and crisp, no text, no logos, no people, no faces. Do not show coins unless the headline is specifically about gold or silver coins — in that case use American Eagle coins only.`;
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
      <img src="https://g6-newsletter-images.s3.us-east-1.amazonaws.com/branding/evening-newsletter-header.png" style="width:100%;display:block;" alt="De-Dollarize News">
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
        <a href="UNSUBSCRIBE_URL_PLACEHOLDER" style="color:#bbbbbb;text-decoration:none;font-size:11px;">Unsubscribe</a>
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

// ── Pick emoji based on subject keywords ─────────────────────────────────────
function getSubjectEmoji(subject) {
  const s = subject.toLowerCase();
  if (s.match(/gold|bullion/))                              return '🥇';
  if (s.match(/silver|eagle/))                             return '🪙';
  if (s.match(/dollar|usd|currency|fiat|petro/))           return '💵';
  if (s.match(/fed|federal reserve|powell|rate/))          return '🏦';
  if (s.match(/bitcoin|crypto|btc/))                       return '₿';
  if (s.match(/oil|energy|opec|gas|fuel/))                 return '⛽';
  if (s.match(/china|brics|russia|yuan/))                  return '🌏';
  if (s.match(/war|conflict|military|attack/))             return '⚠️';
  if (s.match(/crash|collapse|crisis|danger|fail/))        return '🚨';
  if (s.match(/debt|deficit|bankrupt/))                    return '💸';
  if (s.match(/inflation|price|cost|surge|soar|spike/))    return '📈';
  if (s.match(/recession|gdp|economy|gdp|slow/))          return '📉';
  if (s.match(/bank|banking|jpmorgan|wells/))              return '🏛️';
  if (s.match(/bond|treasury|yield/))                     return '📊';
  if (s.match(/print|money supply|m2/))                   return '🖨️';
  if (s.match(/reset|reorder|shift/))                     return '🔄';
  if (s.match(/protect|safe|wealth|asset/))               return '🛡️';
  if (s.match(/tax|tariff|trade|sanction/))               return '💼';
  if (s.match(/card|payment|spend|consumer|retail/))      return '💳';
  if (s.match(/stock|market|invest|portfolio|equity/))    return '📈';
  if (s.match(/warning|alert|urgent|risk|threat/))        return '⚠️';
  return '🔥';
}

// ── Extract JSON array from Claude response (handles code block wrappers) ─────
function extractJSONArray(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
  }
  return null;
}

// ── Function 1: Premium newsletter — single Inner Circle article ──────────────
// article: { title, excerpt, author, url, imageUrl, pubDate }
async function generatePremiumNewsletter(article) {
  const today = TODAY();

  // Claude writes two paragraphs — first faithful, second expands with curiosity
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `You are writing the body for the De-Dollarize News Inner Circle premium newsletter.

Today's Inner Circle article:
Title: ${article.title}
Author: ${article.author}
Excerpt: ${article.excerpt}

Write exactly TWO paragraphs separated by a blank line:

PARAGRAPH 1 (4-5 sentences): Faithfully present the core content from the excerpt. Do not invent facts — stay close to what the excerpt says. Use the same insider, urgent financial voice.

PARAGRAPH 2 (4-5 sentences): Expand on the same topic with more depth. Explore why this matters right now, what the implications are, and what's at stake for wealth protection. Build genuine curiosity and urgency — end with a sentence that makes them absolutely want to click and read the full Inner Circle analysis.

Important: Never use em dashes (—) anywhere. Use commas, periods, or rephrase instead.

Return only the two paragraphs separated by a blank line. No labels, no HTML, no headings.`,
    }],
  });

  const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const parts = rawText.split(/\n\n+/);
  const para1 = parts[0] || rawText;
  const para2 = parts[1] || '';

  const bodyHTML = `
    <!-- Featured image -->
    ${article.imageUrl ? `
    <div style="margin:0;padding:0;">
      <img src="${article.imageUrl}" style="width:100%;display:block;max-height:380px;object-fit:cover;" alt="${article.title}">
    </div>` : ''}

    <!-- Article -->
    <div style="padding:32px 40px 0;">
      <p style="color:#cc0000;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px;">INNER CIRCLE · ${today}</p>
      <h2 style="color:#1a1a1a;font-size:26px;font-weight:800;margin:0 0 10px;line-height:1.3;">${article.title}</h2>
      <p style="color:#888888;font-size:13px;margin:0 0 24px;">By <strong>${article.author}</strong></p>
      <p style="color:#333333;font-size:16px;line-height:1.8;margin:0 0 20px;">${para1}</p>
      ${para2 ? `<p style="color:#333333;font-size:16px;line-height:1.8;margin:0 0 32px;">${para2}</p>` : ''}
      <div style="text-align:center;margin-bottom:40px;">
        <a href="${article.url}" style="display:inline-block;background:#cc0000;color:#ffffff;text-decoration:none;padding:18px 40px;border-radius:6px;font-weight:900;font-size:15px;letter-spacing:.5px;">
          READ THE FULL INNER CIRCLE ANALYSIS →
        </a>
      </div>
    </div>`;

  const html = wrapHTML(bodyHTML, today, PREMIUM_HEADER_HTML(today));
  const subject = `${getSubjectEmoji(article.title)} ${article.title.substring(0, 76)}`;

  return { subject, html };
}

// ── Dynamic header phrases (rotates daily by day of week) ────────────────────
const BREAKING_HEADERS = [
  { icon: '⚡', text: 'Breaking Market Alert' },
  { icon: '🔥', text: "Today's Top Stories" },
  { icon: '🚨', text: 'Market Intelligence Brief' },
  { icon: '📡', text: 'Top Market Briefing' },
  { icon: '⚠️', text: 'Financial Alert' },
  { icon: '🔴', text: "Today's Must-Read" },
  { icon: '💥', text: 'Breaking Financial News' },
];

// ── Function 2: Free newsletter — bullet list + featured story 1 ──────────────
async function generateFreeNewsletter(articles) {
  const today = TODAY();
  const header = BREAKING_HEADERS[new Date().getDay() % BREAKING_HEADERS.length];
  const topStory = articles[0];
  const topStoryContext = `Title: ${topStory.title}\nSummary: ${topStory.excerpt || topStory.summary || '(no summary)'}`;

  // Run Claude (story 1 paragraph), Imagen (1 image), DDN RSS — all concurrently
  const [response, storyImageUrl, ddnArticles] = await Promise.all([
    client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Write a short curiosity-building paragraph (3-4 sentences) for the De-Dollarize News free newsletter about this story:

${topStoryContext}

Open with the key insight. Build urgency. Make the reader feel they absolutely need to know what's behind this. Cut off with "..." leaving them wanting more. Return only the paragraph, no HTML, no em dashes.`,
      }],
    }),
    // Generate 1 image for story 1 only
    generateStoryImage(topStory.title).then(async b64 => {
      if (!b64) return null;
      try { return await uploadToS3(b64); } catch (e) { console.error('S3 upload failed:', e.message); return null; }
    }),
    fetchRecentDDNArticles(2).catch(e => { console.error('DDN RSS failed:', e.message); return []; }),
  ]);

  const curiosityPara = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();

  // ── Numbered bullet list (all 3 headlines) ────────────────────────────────
  const bulletListHTML = `
    <div style="padding:24px 40px 20px;">
      <p style="color:#cc0000;font-size:20px;font-weight:900;margin:0 0 4px;letter-spacing:-0.3px;">${header.icon} ${header.text}</p>
      <p style="color:#888888;font-size:13px;margin:0 0 20px;">Today's most important stories for wealth protection</p>
      <div style="border-left:3px solid #cc0000;padding-left:16px;">
        ${articles.map((a, i) => `
        <p style="margin:0 0 ${i < articles.length - 1 ? '12px' : '0'};font-size:14px;color:#1a1a1a;line-height:1.5;">
          <span style="color:#cc0000;font-weight:700;">${['①','②','③'][i]}</span>&nbsp;
          <strong>${a.title}</strong>
        </p>`).join('')}
      </div>
    </div>`;

  // ── Story 1: full image + curiosity paragraph ─────────────────────────────
  const featuredStoryHTML = `
    <div style="padding:0 40px 0;border-top:2px solid #f0f0f0;margin-top:8px;">
      <div style="padding-top:24px;">
        ${storyImageUrl ? `<img src="${storyImageUrl}" style="width:100%;height:240px;object-fit:cover;display:block;border-radius:6px;margin-bottom:16px;" alt="">` : ''}
        <h2 style="color:#1a1a1a;font-size:19px;font-weight:800;margin:0 0 12px;line-height:1.35;">${topStory.title}</h2>
        <p style="color:#555555;font-size:15px;line-height:1.75;margin:0 0 24px;">${curiosityPara}</p>
      </div>
    </div>`;

  const cta1HTML = `
    <div style="padding:32px 40px;text-align:center;background:#f9f9f9;border-top:3px solid #cc0000;">
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
    <div style="padding:36px 40px;text-align:center;background:#0d0d0d;">
      <p style="color:#cc0000;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">THE DOLLAR ISN'T WAITING</p>
      <p style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;line-height:1.3;">Still reading headlines?</p>
      <p style="color:#aaaaaa;font-size:15px;margin:0 0 24px;line-height:1.5;">Start reading what's <em>behind</em> them.</p>
      <a href="https://offer.dedollarizenews.com/inner-circle-sale/" style="display:inline-block;background:#cc0000;color:#ffffff;text-decoration:none;padding:18px 40px;border-radius:6px;font-weight:900;font-size:15px;letter-spacing:.5px;">
        JOIN INNER CIRCLE NOW →
      </a>
      <p style="color:#555555;font-size:11px;margin:20px 0 0;">Join thousands protecting their wealth from the coming reset.</p>
    </div>`;

  const bodyContent = bulletListHTML + featuredStoryHTML + cta1HTML + whatYouGetHTML + ddnHTML + cta2HTML;
  const html = wrapHTML(bodyContent, today, FREE_HEADER_HTML(today));
  const subject = `${getSubjectEmoji(topStory.title)} ${topStory.title.substring(0, 76)}`;

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
  const subject = `${getSubjectEmoji(firstHeadline)} ${firstHeadline.substring(0, 76)}`;

  return { subject, html };
}

// ── Evening newsletter header ─────────────────────────────────────────────────
const EVENING_HEADER_HTML = (today) => `
    <div style="margin:0;padding:0;">
      <img src="https://g6-newsletter-images.s3.us-east-1.amazonaws.com/branding/evening-newsletter-header.png" style="width:100%;display:block;" alt="While You Were Distracted — De-Dollarize News">
    </div>`;

// ── Function 4: Evening newsletter — today's DDN articles with real images ─────
async function generateEveningNewsletter() {
  const today = TODAY();

  // Fetch today's DDN articles with real featured images
  const articles = await fetchEveningDDNArticles();
  if (articles.length === 0) throw new Error('No DDN articles found for evening newsletter');

  const articleContext = articles.map((a, i) =>
    `Article ${i + 1}:\nTitle: ${a.title}\nExcerpt: ${a.excerpt || '(no excerpt)'}`
  ).join('\n\n');

  // Claude writes curiosity paragraphs only — no Imagen needed (real images from DDN)
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Write a short curiosity-building paragraph (3-4 sentences) for EACH of these ${articles.length} stories for the De-Dollarize News evening newsletter.

${articleContext}

For each story: open with the key insight, build urgency, make readers feel they need to know more, cut off with "...". No em dashes. No HTML.

Return ONLY a JSON array of strings, one paragraph per story:
["Paragraph 1...", "Paragraph 2...", "Paragraph 3..."]`,
    }],
  });

  const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const paragraphs = extractJSONArray(rawText) || articles.map(a => a.excerpt || '');

  // Bullet intro
  const bulletHTML = `
    <div style="padding:28px 40px 8px;text-align:center;">
      <p style="color:#1a1a1a;font-size:20px;font-weight:800;margin:0 0 16px;">De-Dollarize News</p>
      <p style="color:#333333;font-size:15px;line-height:1.75;margin:0;text-align:left;">The headlines may seem disconnected, but together they reveal powerful trends that could affect your finances and the global economy. In today's edition:</p>
    </div>
    <div style="padding:8px 40px 24px;">
      <ul style="margin:0;padding-left:20px;color:#333333;font-size:15px;line-height:2.1;">
        ${articles.map(a => `<li>${a.title}</li>`).join('')}
      </ul>
    </div>
    <div style="height:1px;background:#e8e8e8;margin:0 40px;"></div>`;

  // 3 article blocks with real DDN images
  const storiesHTML = articles.map((a, i) => {
    const para = typeof paragraphs[i] === 'string' ? paragraphs[i] : (a.excerpt || '');
    const imgHTML = a.imageUrl
      ? `<img src="${a.imageUrl}" style="width:100%;height:220px;object-fit:cover;display:block;border-radius:4px;margin-bottom:18px;" alt="">`
      : '';
    const divider = i < articles.length - 1 ? `<div style="height:1px;background:#e8e8e8;margin:32px 40px 0;"></div>` : '';
    return `
    <div style="padding:32px 40px 0;">
      ${imgHTML}
      <p style="color:#cc0000;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 8px;">${a.category || 'De-Dollarize News'}</p>
      <h2 style="color:#1a1a1a;font-size:20px;font-weight:800;margin:0 0 12px;line-height:1.3;">${a.title}</h2>
      <p style="color:#444444;font-size:15px;line-height:1.75;margin:0 0 14px;">${para}</p>
      <a href="${a.url}" style="color:#cc0000;font-size:13px;font-weight:600;text-decoration:none;">dedollarizenews.com</a>
    </div>${divider}`;
  }).join('\n');

  const ctaHTML = `
    <div style="padding:36px 40px;text-align:center;background:#f9f9f9;margin-top:32px;border-top:3px solid #cc0000;">
      <p style="color:#cc0000;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">MEMBERS ONLY</p>
      <a href="https://offer.dedollarizenews.com/inner-circle-sale/" style="display:inline-block;background:#cc0000;color:#ffffff;text-decoration:none;padding:20px 36px;border-radius:6px;font-weight:900;font-size:16px;letter-spacing:.5px;line-height:1.6;">
        GET OUR EXCLUSIVE DAILY ANALYSIS →<br>
        <span style="font-weight:400;font-size:13px;opacity:.9;">Subscribe to Inner Circle for dedollarizenews.com<br>premium content delivered daily</span>
      </a>
      <p style="color:#999999;font-size:12px;margin:16px 0 0;">Full analysis · Real sources · Wealth protection strategies</p>
    </div>`;

  const bodyContent = bulletHTML + storiesHTML + ctaHTML;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
${EVENING_HEADER_HTML(today)}
${bodyContent}
${FOOTER_HTML}
  </div>
</body>
</html>`;

  const subject = `${getSubjectEmoji(articles[0].title)} ${articles[0].title.substring(0, 76)}`;
  return { subject, html };
}

module.exports = { generateNewsletter, generatePremiumNewsletter, generateFreeNewsletter, generateEveningNewsletter };
