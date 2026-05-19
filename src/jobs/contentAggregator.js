const RSSParser = require('rss-parser');
const db = require('../supabase');

const parser = new RSSParser({ timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; G6Newsletter/1.0)' } });

const FEEDS = [
  // News sites
  { url: 'https://dailyreckoning.com/feed',                    source: 'dailyreckoning',  authority: true  },
  { url: 'https://www.zerohedge.com/fullrss2.xml',             source: 'zerohedge',       authority: true  },
  { url: 'https://www.breitbart.com/feed',                     source: 'breitbart',       authority: false },
  { url: 'https://feeds.feedburner.com/NewsmaxNews',           source: 'newsmax',         authority: false },
  { url: 'https://www.sovereignman.com/feed',                  source: 'sovereignman',    authority: true  },
  { url: 'https://internationalman.com/feed',                  source: 'internationalman',authority: false },
  { url: 'https://srsroccoreport.com/feed',                    source: 'srsroccoreport',  authority: false },
  { url: 'https://www.rogueeconomics.com/feed',                source: 'rogueeconomics',  authority: false },
  { url: 'https://reesereport.com/feed',                       source: 'reesereport',     authority: false },
  { url: 'https://remnant-tv.com/feed',                        source: 'remnant-tv',      authority: false },
  { url: 'https://watchdognews.org/feed',                      source: 'watchdognews',    authority: false },
  { url: 'https://www.cfact.org/feed',                         source: 'cfact',           authority: false },
  { url: 'https://stopworldcontrol.com/feed',                  source: 'stopworldcontrol',authority: false },
  { url: 'https://harrydent.com/feed',                         source: 'harrydent',       authority: false },
  { url: 'https://www.georgegammon.com/feed',                  source: 'georgegammon',    authority: true  },
  // YouTube channels
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCuifm5ns5SRG8LZJ6gCfKyw', source: 'youtube-kitco',       authority: false },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCpvyOqtEc86X8w8_Se0t4-w', source: 'youtube-mises',       authority: false },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCBOqkAGTtzZVmKvY4SwdZ2g', source: 'youtube-heresy',      authority: false },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCBLGQrOOfs5l7fay66B2-3Q', source: 'youtube-macro',       authority: false },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_z1-SiJKvvBsFb95eT9JwQ', source: 'youtube-investanswers',authority: false },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC9JTMdUdkgCTSLgea072tWg', source: 'youtube-moneyGPS',    authority: false },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCOqoxEetp1w7AUVPI9zuWqw', source: 'youtube-goldsilver',  authority: false },
];

const KEYWORDS = [
  'BRICS', 'gold', 'silver', 'dollar', 'Fed', 'inflation', 'debt', 'currency',
  'collapse', 'crisis', 'recession', 'devaluation', 'yuan', 'reserve',
  'de-dollarization', 'wealth', 'protect', 'economy',
];

function extractKeywords(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return KEYWORDS.filter(kw => lower.includes(kw.toLowerCase()));
}

function scoreArticle(article, allTitles, authority) {
  let score = 0;
  const text = `${article.title || ''} ${article.summary || ''}`;
  const kws = extractKeywords(text);

  // +5 per keyword
  score += kws.length * 5;

  // +8 for authority source
  if (authority) score += 8;

  // Recency bonus
  if (article.published_at) {
    const ageMs = Date.now() - new Date(article.published_at).getTime();
    const ageHours = ageMs / 3_600_000;
    if (ageHours <= 6)  score += 3;
    else if (ageHours <= 12) score += 2;
  }

  // +10 if 2+ other titles share keywords (cross-source coverage)
  const shared = kws.filter(kw =>
    allTitles.filter(t => t.toLowerCase().includes(kw.toLowerCase())).length >= 2
  );
  if (shared.length > 0) score += 10;

  return score;
}

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items || []).slice(0, 20).map(item => ({
      title:        item.title?.trim() || '',
      url:          item.link || item.guid || '',
      source:       feed.source,
      authority:    feed.authority,
      summary:      item.contentSnippet?.slice(0, 500) || item.content?.replace(/<[^>]+>/g, '').slice(0, 500) || '',
      published_at: item.pubDate || item.isoDate || null,
    }));
  } catch (err) {
    console.warn(`⚠️  Failed to fetch ${feed.source}: ${err.message}`);
    return [];
  }
}

function deduplicateArticles(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const kws = extractKeywords(a.title).sort().join(',');
    const key = kws || a.title.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function runContentAggregator() {
  console.log('📡 Content aggregator starting...');

  // Fetch all feeds in parallel
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const allArticles = results.flat().filter(a => a.title && a.url);
  console.log(`Fetched ${allArticles.length} raw articles from ${FEEDS.length} feeds`);

  const allTitles = allArticles.map(a => a.title);

  // Score and deduplicate
  const scored = allArticles.map(a => ({
    ...a,
    score: scoreArticle(a, allTitles, a.authority),
  }));

  const deduped = deduplicateArticles(scored);

  // Sort by score descending, take top 10
  const top10 = deduped.sort((a, b) => b.score - a.score).slice(0, 10);
  console.log(`Top 10 articles selected (scores: ${top10.map(a => a.score).join(', ')})`);

  // Load URLs already saved today to avoid dupes
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { rows: existing } = await db.query(
    `SELECT url FROM daily_articles WHERE created_at >= $1`,
    [todayStart.toISOString()]
  );
  const existingUrls = new Set(existing.map(r => r.url));

  // Insert new articles
  let saved = 0;
  for (const a of top10) {
    if (existingUrls.has(a.url)) continue;
    await db.query(
      `INSERT INTO daily_articles (title, url, source, score, summary, published_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [a.title, a.url, a.source, a.score, a.summary, a.published_at || null]
    );
    saved++;
  }

  console.log(`✅ Content aggregator done. Saved ${saved} new articles.`);
}

module.exports = { runContentAggregator };
