
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

// ── Fetch today's DDN articles via rss2json (bypasses Cloudflare) ─────────────
async function fetchTodayWPArticles() {
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://dedollarizenews.com/feed/')}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`rss2json error: ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(`rss2json returned: ${data.status}`);

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

// ── Fetch recent DDN articles via rss2json proxy (bypasses Cloudflare) ────────
async function fetchRecentDDNArticles(count = 2) {
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://dedollarizenews.com/feed/')}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`rss2json error: ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(`rss2json returned: ${data.status}`);

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
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://dedollarizenews.com/category/inner-circle/feed/')}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`rss2json error: ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(`rss2json returned: ${data.status}`);
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

// ── Fetch today's DDN articles for evening newsletter (up to 3, with images) ──
async function fetchEveningDDNArticles() {
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://dedollarizenews.com/feed/')}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`rss2json error: ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(`rss2json returned: ${data.status}`);

  // Filter for today's articles (last 24h)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let items = data.items.filter(item => item.pubDate && new Date(item.pubDate + ' UTC') >= cutoff);

  // Fallback to latest 3 if nothing today
  if (items.length === 0) {
    console.warn('Evening: no articles in last 24h — falling back to latest 3');
    items = data.items.slice(0, 3);
  }

  // Take up to 3
  items = items.slice(0, 3);
  console.log(`Evening RSS: ${items.length} DDN articles`);

  return items.map(item => {
    const rawUrl = item.enclosure?.link || item.thumbnail || null;
    const imageUrl = rawUrl ? rawUrl.replace(/-\d+x\d+(\.\w+)$/, '$1') : null;
    return {
      title: stripHtml(item.title || ''),
      excerpt: stripHtml(item.description || '').slice(0, 300).trim(),
      url: item.link,
      imageUrl,
      category: item.categories?.[0] || 'De-Dollarize News',
    };
  }).filter(a => a.title && a.url);
}

module.exports = { fetchArticlesForNewsletter, fetchLatestInnerCircleArticle, fetchRecentDDNArticles, fetchEveningDDNArticles };
