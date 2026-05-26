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
  // Use Eastern Time midnight so only today's ET articles are fetched
  const ET_OFFSET_MS = 4 * 60 * 60 * 1000; // EDT = UTC-4
  const nowET = new Date(Date.now() - ET_OFFSET_MS);
  const todayET = nowET.toISOString().split('T')[0]; // "2026-05-26"
  const after = `${todayET}T00:00:00`; // WP interprets without Z as site timezone

  const url =
    `${WP_BASE}/posts?per_page=50` +
    `&after=${after}` +
    `&orderby=date&order=desc` +
    `&_fields=id,title,excerpt,date,link,featured_media`;

  const res = await fetch(url, { headers: WP_HEADERS });
  if (!res.ok) throw new Error(`WP posts API ${res.status}`);

  const posts = await res.json();
  if (!Array.isArray(posts) || posts.length === 0) return [];

  console.log(`WP API: ${posts.length} posts for ${todayET} ET`);

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


// Primary entry point: WP articles from last 48h, no fallback
async function fetchArticlesForNewsletter() {
  try {
    const wpArticles = await fetchTodayWPArticles();
    if (wpArticles.length > 0) return wpArticles;
    console.warn('No WP articles found in last 48h — premium newsletter will be skipped');
    return [];
  } catch (err) {
    console.warn(`WP API failed (${err.message}) — premium newsletter will be skipped`);
    return [];
  }
}

module.exports = { fetchArticlesForNewsletter };
