
function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&#39;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8230;/g, '...')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Minimal RSS XML parser — returns rss2json-compatible item objects ─────────
function unwrapCdata(s = '') {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}
function extractTag(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
  const m = block.match(re);
  return m ? unwrapCdata(m[1]) : '';
}
function extractAllTags(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(block)) !== null) out.push(unwrapCdata(m[1]));
  return out;
}
function extractAttr(block, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["']`);
  const m = block.match(re);
  return m ? m[1] : null;
}
function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const thumbnail = extractAttr(block, 'media:thumbnail', 'url') || extractAttr(block, 'media:content', 'url');
    const enclosureUrl = extractAttr(block, 'enclosure', 'url');
    items.push({
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link'),
      description: extractTag(block, 'description') || extractTag(block, 'content:encoded'),
      pubDate: extractTag(block, 'pubDate'),
      categories: extractAllTags(block, 'category'),
      author: extractTag(block, 'dc:creator'),
      thumbnail,
      enclosure: enclosureUrl ? { link: enclosureUrl } : null,
    });
  }
  return items;
}

// Direct DDN RSS first (fast, independent), rss2json as fallback (bypasses Cloudflare block on Render IPs)
async function fetchFeed(feedUrl) {
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DDNNewsletter/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const xml = await res.text();
      const items = parseRssItems(xml);
      if (items.length > 0) {
        console.log(`RSS direct: ${items.length} items from ${feedUrl}`);
        return { items };
      }
      console.warn(`RSS direct: 0 items parsed, falling back to rss2json`);
    } else {
      console.warn(`RSS direct: HTTP ${res.status}, falling back to rss2json`);
    }
  } catch (err) {
    console.warn(`RSS direct failed (${err.message}), falling back to rss2json`);
  }

  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`rss2json error: ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(`rss2json returned: ${data.status}`);
  console.log(`RSS via rss2json fallback: ${data.items?.length || 0} items`);
  return { items: data.items || [] };
}

// ── Fetch today's DDN articles (direct RSS, rss2json fallback) ────────────────
async function fetchTodayWPArticles() {
  const data = await fetchFeed('https://dedollarizenews.com/feed/');

  // Filter articles published in last 24 hours
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let items = data.items.filter(item => item.pubDate && new Date(item.pubDate + ' UTC') >= cutoff);

  // Fallback to latest 5 if nothing recent (e.g. weekend/holiday)
  if (items.length === 0) {
    console.warn('No articles in last 24h — falling back to latest 5');
    items = data.items.slice(0, 5);
  }

  console.log(`RSS via rss2json: ${items.length} articles for premium newsletter`);

  return items.map(item => {
    const rawUrl = item.enclosure?.link || item.thumbnail || null;
    const imageUrl = rawUrl ? rawUrl.replace(/-\d+x\d+(\.\w+)$/, '$1') : null;
    const pubDate = new Date(item.pubDate + ' UTC');
    const timeStr = pubDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return {
      title: stripHtml(item.title || ''),
      excerpt: stripHtml(item.description || '').slice(0, 300).trim(),
      url: item.link,
      imageUrl,
      publishedTime: `Today at ${timeStr}`,
      source: 'De-Dollarize News',
    };
  }).filter(a => a.title && a.url);
}

// Primary entry point for premium newsletter
async function fetchArticlesForNewsletter() {
  try {
    const articles = await fetchTodayWPArticles();
    if (articles.length > 0) return articles;
    console.warn('No articles found — premium newsletter will be skipped');
    return [];
  } catch (err) {
    console.warn(`Article fetch failed (${err.message}) — premium newsletter will be skipped`);
    return [];
  }
}

// ── Fetch recent DDN articles (direct RSS, rss2json fallback) ─────────────────
async function fetchRecentDDNArticles(count = 2) {
  const data = await fetchFeed('https://dedollarizenews.com/feed/');

  return data.items.slice(0, count).map(item => {
    const rawUrl = item.enclosure?.link || item.thumbnail || null;
    const imageUrl = rawUrl ? rawUrl.replace(/-\d+x\d+(\.\w+)$/, '$1') : null;
    return {
      title: stripHtml(item.title || ''),
      url: item.link,
      category: item.categories?.[0] || 'Featured',
      excerpt: stripHtml(item.description || '').slice(0, 150).trim(),
      imageUrl,
    };
  });
}

// ── Fetch latest Inner Circle article for premium newsletter ──────────────────
async function fetchLatestInnerCircleArticle() {
  const data = await fetchFeed('https://dedollarizenews.com/category/inner-circle/feed/');
  if (!data.items?.length) throw new Error('No Inner Circle articles found');

  const item = data.items[0];
  const rawUrl = item.enclosure?.link || item.thumbnail || null;
  const imageUrl = rawUrl ? rawUrl.replace(/-\d+x\d+(\.\w+)$/, '$1') : null;

  return {
    title: stripHtml(item.title || ''),
    excerpt: stripHtml(item.description || ''),
    author: item.author || 'De-Dollarize News',
    url: item.link,
    imageUrl,
    pubDate: item.pubDate,
  };
}

// ── Banking keywords for evening article prioritisation ───────────────────────
const EVENING_BANKING_KEYWORDS = [
  'fed', 'federal reserve', 'powell', 'rate', 'interest rate', 'bank', 'banking',
  'jpmorgan', 'goldman', 'morgan stanley', 'citibank', 'wells fargo',
  'treasury', 'yield', 'bond', 'central bank', 'boj', 'ecb', 'imf',
  'credit', 'lending', 'deposit', 'fdic', 'liquidity', 'debt ceiling',
  'bailout', 'insolvency', 'monetary policy', 'quantitative',
];

function isBankingArticle(title, description) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  return EVENING_BANKING_KEYWORDS.some(kw => text.includes(kw));
}

// ── Fetch today's DDN articles for evening newsletter (banking first, then 2 most recent) ──
async function fetchEveningDDNArticles() {
  const data = await fetchFeed('https://dedollarizenews.com/feed/');

  // Filter for today's articles (last 24h)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let items = data.items.filter(item => item.pubDate && new Date(item.pubDate + ' UTC') >= cutoff);

  // No new articles today — skip evening send
  if (items.length === 0) {
    console.warn('Evening: no new DDN articles in last 24h — skipping send');
    return [];
  }

  // Convert to article objects
  const mapped = items.map(item => {
    const rawUrl = item.enclosure?.link || item.thumbnail || null;
    const imageUrl = rawUrl ? rawUrl.replace(/-\d+x\d+(\.\w+)$/, '$1') : null;
    return {
      title: stripHtml(item.title || ''),
      excerpt: stripHtml(item.description || '').slice(0, 300).trim(),
      url: item.link,
      imageUrl,
      category: item.categories?.[0] || 'De-Dollarize News',
      isBanking: isBankingArticle(item.title, item.description),
    };
  }).filter(a => a.title && a.url);

  // Find first banking article
  const bankingIdx = mapped.findIndex(a => a.isBanking);

  let selected;
  if (bankingIdx > 0) {
    // Banking article is not already first — promote it, fill rest with most recent others
    const bankingArticle = mapped[bankingIdx];
    const others = mapped.filter((_, i) => i !== bankingIdx).slice(0, 2);
    selected = [bankingArticle, ...others];
    console.log(`Evening RSS: banking article promoted to position 1: "${bankingArticle.title.slice(0, 50)}"`);
  } else {
    // Banking article is already first (or none exists) — take 3 most recent as-is
    selected = mapped.slice(0, 3);
    if (bankingIdx === 0) console.log(`Evening RSS: banking article already at position 1`);
    else console.log('Evening RSS: no banking article found — using 3 most recent');
  }

  console.log(`Evening RSS: ${selected.length} DDN articles selected`);
  return selected;
}

module.exports = { fetchArticlesForNewsletter, fetchLatestInnerCircleArticle, fetchRecentDDNArticles, fetchEveningDDNArticles };
