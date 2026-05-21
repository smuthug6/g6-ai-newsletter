const RSSParser = require('rss-parser');

const WP_BASE = 'https://dedollarizenews.com/wp-json/wp/v2';
const WP_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; G6Newsletter/1.0; +https://dedollarizenews.com)',
};

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

async function fetchTodayWPArticles() {
  const dateStr = new Date().toISOString().split('T')[0]; // "2026-05-21"
  const url =
    `${WP_BASE}/posts?per_page=50` +
    `&after=${dateStr}T00:00:00` +
    `&before=${dateStr}T23:59:59` +
    `&_fields=id,title,excerpt,date,link,featured_media`;

  const res = await fetch(url, { headers: WP_HEADERS });
  if (!res.ok) throw new Error(`WP posts API ${res.status}`);

  const posts = await res.json();
  if (!Array.isArray(posts) || posts.length === 0) return [];

  console.log(`WP API: ${posts.length} posts for ${dateStr}`);

  // Fetch all featured images in parallel
  const articles = await Promise.all(posts.map(async (post) => {
    let imageUrl = null;
    if (post.featured_media) {
      try {
        const mRes = await fetch(
          `${WP_BASE}/media/${post.featured_media}?_fields=source_url`,
          { headers: WP_HEADERS }
        );
        if (mRes.ok) {
          const m = await mRes.json();
          imageUrl = m.source_url || null;
        }
      } catch (_) { /* image is optional */ }
    }

    const postDate = new Date(post.date);
    const timeStr = postDate.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    });

    return {
      title: stripHtml(post.title?.rendered || ''),
      excerpt: stripHtml(post.excerpt?.rendered || ''),
      url: post.link,
      imageUrl,
      publishedTime: `Today at ${timeStr}`,
      source: 'De-Dollarize News',
    };
  }));

  return articles.filter(a => a.title && a.url);
}

// Fallback: top 3 recent articles from Dream 100 RSS feeds
const FALLBACK_FEEDS = [
  'https://www.sovereignman.com/feed',
  'https://www.zerohedge.com/fullrss2.xml',
  'https://dailyreckoning.com/feed',
  'https://internationalman.com/feed',
  'https://harrydent.com/feed',
];

async function fetchFallbackArticles() {
  const parser = new RSSParser({
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; G6Newsletter/1.0)' },
  });

  const results = await Promise.allSettled(FALLBACK_FEEDS.map(url => parser.parseURL(url)));
  const articles = [];

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const item = result.value.items?.[0];
    if (!item?.title || !item?.link) continue;
    articles.push({
      title: item.title.trim(),
      excerpt: item.contentSnippet?.slice(0, 400) || '',
      url: item.link || item.guid || '',
      imageUrl: null,
      publishedTime: null,
      source: result.value.title || 'Financial News',
    });
    if (articles.length >= 3) break;
  }

  return articles;
}

// Primary entry point: WP articles first, RSS fallback if none
async function fetchArticlesForNewsletter() {
  try {
    const wpArticles = await fetchTodayWPArticles();
    if (wpArticles.length > 0) return wpArticles;
    console.log('No WP articles for today — using Dream 100 RSS fallback');
  } catch (err) {
    console.warn(`WP API failed (${err.message}) — using Dream 100 RSS fallback`);
  }
  return fetchFallbackArticles();
}

module.exports = { fetchArticlesForNewsletter };
