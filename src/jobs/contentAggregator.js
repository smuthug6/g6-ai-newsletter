const RSSParser = require('rss-parser');
const db = require('../supabase');

const parser = new RSSParser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; G6Newsletter/1.0)' },
});

const FEEDS = [
  { url: 'https://dailyreckoning.com/feed',                    source: 'Daily Reckoning'    },
  { url: 'https://www.zerohedge.com/fullrss2.xml',             source: 'ZeroHedge'          },
  { url: 'https://www.sovereignman.com/feed',                  source: 'Sovereign Man'      },
  { url: 'https://internationalman.com/feed',                  source: 'International Man'  },
  { url: 'https://srsroccoreport.com/feed',                    source: 'SRSRocco Report'    },
  { url: 'https://www.rogueeconomics.com/feed',                source: 'Rogue Economics'    },
  { url: 'https://harrydent.com/feed',                         source: 'Harry Dent'         },
  { url: 'https://www.georgegammon.com/feed',                  source: 'George Gammon'      },
  { url: 'https://reesereport.com/feed',                       source: 'Reese Report'       },
  { url: 'https://remnant-tv.com/feed',                        source: 'Remnant TV'         },
  { url: 'https://watchdognews.org/feed',                      source: 'Watchdog News'      },
  { url: 'https://www.cfact.org/feed',                         source: 'CFACT'              },
  { url: 'https://stopworldcontrol.com/feed',                  source: 'Stop World Control' },
  { url: 'https://www.breitbart.com/feed',                     source: 'Breitbart'          },
  { url: 'https://feeds.feedburner.com/NewsmaxNews',           source: 'Newsmax'            },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCuifm5ns5SRG8LZJ6gCfKyw', source: 'Kitco News'      },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCpvyOqtEc86X8w8_Se0t4-w', source: 'Mises Institute' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCBOqkAGTtzZVmKvY4SwdZ2g', source: 'Heresy Financial' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCBLGQrOOfs5l7fay66B2-3Q', source: 'Macro Voices'    },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_z1-SiJKvvBsFb95eT9JwQ', source: 'InvestAnswers'   },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC9JTMdUdkgCTSLgea072tWg', source: 'The Money GPS'   },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCOqoxEetp1w7AUVPI9zuWqw', source: 'GoldSilver'      },
];

const KEYWORDS = [
  'gold', 'silver', 'dollar', 'debt', 'inflation', 'deflation', 'brics', 'fed',
  'federal reserve', 'recession', 'economy', 'gdp', 'copper', 'market', 'invest',
  'financial', 'bank', 'currency', 'crypto', 'bitcoin', 'oil', 'energy', 'china',
  'trade', 'tariff', 'treasury', 'bond', 'yield', 'collapse', 'devaluation', 'wealth',
  'stocks', 'interest rate', 'powell', 'jpmorgan', 'wall street', 'deficit', 'credit',
  'moody', 'de-dollarization', 'protect', 'silver', 'commodities', 'petrodollar',
];

async function fetchAllFeeds() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const results = await Promise.allSettled(
    FEEDS.map(f => parser.parseURL(f.url).then(p => ({ feed: f, items: p.items || [] })))
  );

  const articles = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { feed, items } = r.value;
    for (const item of items) {
      const pub = item.pubDate || item.isoDate;
      if (!pub || new Date(pub) < cutoff) continue;
      const text = (item.title + ' ' + (item.contentSnippet || '')).toLowerCase();
      if (!KEYWORDS.some(kw => text.includes(kw))) continue;
      articles.push({
        source: feed.source,
        title: (item.title || '').trim(),
        url: item.link || item.guid || '',
        summary: (item.contentSnippet || '').slice(0, 300).trim(),
        published_at: new Date(pub).toISOString(),
      });
    }
  }

  console.log(`Dream 100: ${articles.length} relevant articles in last 24h`);
  return articles;
}

// ── Ask Grok to rank the top 10 trending topics ───────────────────────────────
async function rankWithGrok(articles) {
  if (!process.env.GROK_API_KEY) throw new Error('GROK_API_KEY not set');

  const articleList = articles
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}${a.summary ? ' — ' + a.summary.slice(0, 150) : ''}`)
    .join('\n');

  const prompt = `You are analyzing financial news for a de-dollarization and wealth protection newsletter.

From these articles published in the last 24 hours, identify the TOP 10 most impactful and trending topics in the financial, de-dollarization, gold, silver, dollar collapse, and wealth protection space.

Use your real-time knowledge of what is trending on X/Twitter right now to rank these by virality, engagement, and importance to people worried about protecting their wealth.

For each topic return a JSON object with:
- headline: punchy, urgent headline under 80 characters
- summary: 2-3 sentences — what's happening, why it matters for wealth protection, what readers should know
- source: which feed(s) cover this
- score: virality score 1-100

Return ONLY a valid JSON array of 10 objects. No other text.

Articles:
${articleList}`;

  const resp = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-3',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 3000,
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`Grok API error: ${data.error?.message || JSON.stringify(data)}`);

  const text = data.choices[0].message.content;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Grok did not return valid JSON array');

  const topics = JSON.parse(match[0]);
  console.log(`Grok ranked ${topics.length} topics`);
  return topics;
}

// ── Save top 10 Grok topics to daily_articles table ──────────────────────────
async function saveTopicsToQueue(topics) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Clear ALL auto-generated entries (keep manually added ones)
  await db.query(`DELETE FROM daily_articles WHERE manually_added IS NOT TRUE`);

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    await db.query(
      `INSERT INTO daily_articles (title, url, source, score, summary, approved)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [
        t.headline || t.title || '',
        t.url || '',
        t.source || 'Dream 100',
        t.score || (100 - i * 10),
        t.summary || '',
      ]
    );
  }

  console.log(`✅ Saved ${topics.length} Grok topics to content queue`);
}

// ── Auto-approve top 5 if boss hasn't manually approved any ──────────────────
async function autoApproveTop5() {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { rows: approved } = await db.query(
    `SELECT COUNT(*) FROM daily_articles WHERE approved = true AND created_at >= $1`,
    [todayStart.toISOString()]
  );

  if (parseInt(approved[0].count) > 0) {
    console.log(`Auto-approve skipped — ${approved[0].count} already approved manually`);
    return;
  }

  const { rows: top5 } = await db.query(
    `SELECT id FROM daily_articles WHERE created_at >= $1 ORDER BY score DESC LIMIT 5`,
    [todayStart.toISOString()]
  );

  if (top5.length === 0) {
    console.warn('Auto-approve: no articles in queue for today');
    return;
  }

  await db.query(
    `UPDATE daily_articles SET approved = true WHERE id = ANY($1::uuid[])`,
    [top5.map(r => r.id)]
  );
  console.log(`✅ Auto-approved top ${top5.length} articles`);
}

// ── Main: fetch RSS → Grok → save to DB ──────────────────────────────────────
async function runContentAggregator() {
  console.log('📡 Content aggregator starting...');

  const articles = await fetchAllFeeds();

  if (articles.length === 0) {
    console.warn('No relevant articles found in Dream 100 feeds');
    return;
  }

  const topics = await rankWithGrok(articles);
  await saveTopicsToQueue(topics);

  console.log('✅ Content aggregator complete');
  return topics;
}

module.exports = { runContentAggregator, autoApproveTop5, fetchAllFeeds };
