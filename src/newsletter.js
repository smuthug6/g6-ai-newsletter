const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Generate today's newsletter HTML ─────────────────────────────────────────
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
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [
      {
        role: 'user',
        content: `Search for the latest news today (${today}) on these topics: ${topicList}. 
        Find 5-7 of the most important, interesting, or viral stories. 
        For each story get the headline, a brief summary, and the source URL.`
      }
    ]
  });

  // Extract the text summary from the search response
  const searchSummary = searchResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  // Step 2: Format into a beautiful newsletter
  const newsletterResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [
      {
        role: 'user',
        content: `You are a professional newsletter writer. Using the research below, write a daily newsletter email.

Topics: ${topicList}
Date: ${today}

Research:
${searchSummary}

Write the newsletter in this EXACT format — return ONLY valid HTML, nothing else:

<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px 40px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;">🤖 G6 AI</h1>
      <p style="color:#a0aec0;margin:8px 0 0;font-size:14px;">${today}</p>
    </div>

    <!-- Intro -->
    <div style="padding:32px 40px 0;">
      <p style="color:#4a5568;font-size:16px;line-height:1.6;margin:0;">Here's what's happening in AI today — curated for you.</p>
    </div>

    <!-- Stories: repeat this block for each story -->
    <div style="padding:24px 40px 0;">
      <div style="border-left:3px solid #6366f1;padding-left:16px;margin-bottom:28px;">
        <h2 style="color:#1a202c;font-size:18px;font-weight:600;margin:0 0 8px;">[HEADLINE]</h2>
        <p style="color:#718096;font-size:15px;line-height:1.6;margin:0 0 10px;">[2-3 sentence summary]</p>
        <a href="[SOURCE URL]" style="color:#6366f1;font-size:13px;text-decoration:none;font-weight:500;">Read more →</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f7fafc;padding:24px 40px;margin-top:32px;border-top:1px solid #e2e8f0;">
      <p style="color:#a0aec0;font-size:12px;text-align:center;margin:0;">
        You're receiving this because you subscribed to G6 AI.<br>
        <a href="{{unsubscribe}}" style="color:#a0aec0;">Unsubscribe</a>
      </p>
    </div>

  </div>
</body>
</html>

Fill in all the stories from the research. Use the exact HTML structure above. Make summaries punchy and interesting.`
      }
    ]
  });

  const html = newsletterResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Extract a subject line from the first headline
  const subjectMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
  const firstHeadline = subjectMatch ? subjectMatch[1] : 'Your G6 AI Newsletter';
  const subject = `🤖 G6 AI: ${firstHeadline.substring(0, 60)}`;

  return { subject, html };
}

module.exports = { generateNewsletter };
