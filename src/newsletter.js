const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a financial intelligence writer for De-Dollarize News. Your tone is urgent, bold, and insider-focused. You write like someone exposing what the establishment doesn't want people to know. Headlines are dramatic and direct. Summaries are 2-3 sentences, punchy, and focused on protecting wealth.`;

async function generateNewsletter(topics) {
  const topicList = topics.join(', ');
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  console.log(`Generating newsletter for topics: ${topicList}`);

  // Step 1: Use web search to get fresh news
  const searchResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [
      {
        role: 'user',
        content: `Search for the latest news today (${today}) on these topics: ${topicList}.
        Find 5-7 of the most important, alarming, or revealing stories.
        For each story get the headline, a brief summary, and the source URL.`
      }
    ]
  });

  const searchSummary = searchResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  // Step 2: Format into the De-Dollarize News template
  const newsletterResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Using the research below, write today's De-Dollarize News email newsletter.

Topics: ${topicList}
Date: ${today}

Research:
${searchSummary}

Write the newsletter in this EXACT format — return ONLY valid HTML, nothing else:

<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#111111;">

    <!-- Header -->
    <div style="background:#1a0000;padding:32px 40px;text-align:center;border-bottom:2px solid #cc0000;">
      <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">DE-DOLLARIZE NEWS</h1>
      <p style="color:#cc0000;margin:10px 0 0;font-size:13px;letter-spacing:1px;text-transform:uppercase;font-weight:700;">While You Were Distracted</p>
      <p style="color:#666666;margin:8px 0 0;font-size:12px;">${today}</p>
    </div>

    <!-- Intro -->
    <div style="padding:32px 40px 0;">
      <p style="color:#cccccc;font-size:15px;line-height:1.7;margin:0;">The dollar is under attack. Here's what the financial press is burying — and what you need to know to protect your wealth.</p>
    </div>

    <!-- Stories: repeat this block for each story -->
    <div style="padding:24px 40px 0;">
      <div style="border-left:3px solid #cc0000;padding-left:16px;margin-bottom:32px;">
        <h2 style="color:#ffffff;font-size:17px;font-weight:700;margin:0 0 8px;line-height:1.4;">[HEADLINE]</h2>
        <p style="color:#aaaaaa;font-size:14px;line-height:1.7;margin:0 0 10px;">[2-3 sentence punchy summary focused on wealth protection implications]</p>
        <a href="[SOURCE URL]" style="color:#cc0000;font-size:12px;text-decoration:none;font-weight:700;letter-spacing:0.5px;">READ THE FULL STORY →</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#0a0a0a;padding:28px 40px;margin-top:32px;border-top:1px solid #cc0000;">
      <p style="color:#555555;font-size:12px;text-align:center;margin:0;line-height:1.8;">
        Protecting your wealth from the system. dedollarizenews.com<br>
        <a href="{{unsubscribe}}" style="color:#555555;">Unsubscribe</a>
      </p>
    </div>

  </div>
</body>
</html>

Fill in all stories from the research. Use the exact HTML structure above. Make every headline dramatic and urgent.`
      }
    ]
  });

  const html = newsletterResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const subjectMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
  const firstHeadline = subjectMatch ? subjectMatch[1] : 'De-Dollarize News Alert';
  const subject = `ALERT: ${firstHeadline.substring(0, 65)}`;

  return { subject, html };
}

module.exports = { generateNewsletter };
