const mysql = require('mysql2/promise');

const config = {
  host: 'mysql-8-parser.groupbwt.com',
  port: 3306,
  user: 'pwc-social-media-ro',
  password: 'mCgQLLn7Fz1rh75k',
  database: 'pwc-social-media',
  connectTimeout: 30000,
};

async function analyze() {
  const conn = await mysql.createConnection(config);
  console.log('Connected!\n');

  // Sessions
  console.log('=== SESSIONS ===');
  const [sessions] = await conn.query('SELECT id, name, status, created_at FROM sessions ORDER BY created_at DESC LIMIT 10');
  sessions.forEach(s => console.log(`  [${s.id}] ${s.name} | status=${s.status} | ${s.created_at}`));

  // Search queries - distinct themes
  console.log('\n=== DISTINCT THEMES ===');
  const [themes] = await conn.query('SELECT theme, COUNT(*) as cnt FROM x_search_queries GROUP BY theme ORDER BY cnt DESC');
  themes.forEach(r => console.log(`  ${r.theme}: ${r.cnt}`));

  // Distinct policies
  console.log('\n=== DISTINCT POLICIES ===');
  const [policies] = await conn.query('SELECT policy, COUNT(*) as cnt FROM x_search_queries GROUP BY policy ORDER BY cnt DESC LIMIT 20');
  policies.forEach(r => console.log(`  ${r.policy}: ${r.cnt}`));

  // Distinct countries
  console.log('\n=== DISTINCT COUNTRIES ===');
  const [countries] = await conn.query('SELECT country, COUNT(*) as cnt FROM x_search_queries GROUP BY country ORDER BY cnt DESC');
  countries.forEach(r => console.log(`  ${r.country}: ${r.cnt}`));

  // Distinct years
  console.log('\n=== DISTINCT YEARS ===');
  const [years] = await conn.query('SELECT year, COUNT(*) as cnt FROM x_search_queries GROUP BY year ORDER BY year');
  years.forEach(r => console.log(`  ${r.year}: ${r.cnt}`));

  // Tweets date range
  console.log('\n=== TWEETS DATE RANGE ===');
  const [dateRange] = await conn.query('SELECT MIN(date_published) as min_date, MAX(date_published) as max_date FROM x_tweets');
  console.log(`  From: ${dateRange[0].min_date}`);
  console.log(`  To:   ${dateRange[0].max_date}`);

  // Tweets per year
  console.log('\n=== TWEETS PER YEAR ===');
  const [tpy] = await conn.query(`
    SELECT YEAR(date_published) as yr, COUNT(*) as cnt
    FROM x_tweets
    WHERE date_published IS NOT NULL
    GROUP BY yr ORDER BY yr
  `);
  tpy.forEach(r => console.log(`  ${r.yr}: ${r.cnt.toLocaleString()}`));

  // Sample queries with hashtags
  console.log('\n=== SAMPLE QUERIES (with hashtags) ===');
  const [sampleQ] = await conn.query(`
    SELECT theme, policy, year, country, hashtag, search_date_range, status
    FROM x_search_queries
    WHERE hashtag IS NOT NULL
    LIMIT 10
  `);
  sampleQ.forEach(r => console.log(`  theme=${r.theme} | policy=${r.policy} | year=${r.year} | country=${r.country} | hashtag=${r.hashtag} | range=${r.search_date_range} | status=${r.status}`));

  // Sample tweets
  console.log('\n=== SAMPLE TWEETS ===');
  const [tweets] = await conn.query(`
    SELECT t.post_text, t.author, t.date_published, t.likes_count, t.retweets_count, t.views_count,
           q.theme, q.policy, q.country
    FROM x_tweets t
    JOIN x_search_queries q ON t.query_id = q.id
    WHERE t.date_published > '2024-01-01'
    LIMIT 5
  `);
  tweets.forEach(r => console.log(`  [${r.date_published}] @${r.author} | theme=${r.theme} | policy=${r.policy} | country=${r.country}\n    "${r.post_text?.substring(0, 100)}"\n    ❤️ ${r.likes_count} | RT ${r.retweets_count} | 👁️ ${r.views_count}\n`));

  // Tweet engagement stats
  console.log('\n=== ENGAGEMENT STATS ===');
  const [eng] = await conn.query(`
    SELECT
      q.country,
      q.theme,
      COUNT(t.id) as tweet_count,
      SUM(t.likes_count) as total_likes,
      SUM(t.retweets_count) as total_retweets,
      SUM(t.views_count) as total_views,
      AVG(t.likes_count) as avg_likes
    FROM x_tweets t
    JOIN x_search_queries q ON t.query_id = q.id
    GROUP BY q.country, q.theme
    ORDER BY tweet_count DESC
    LIMIT 20
  `);
  eng.forEach(r => console.log(`  ${r.country}/${r.theme}: ${Number(r.tweet_count).toLocaleString()} tweets | likes=${Number(r.total_likes).toLocaleString()} | RT=${Number(r.total_retweets).toLocaleString()} | views=${Number(r.total_views).toLocaleString()}`));

  // post_status values
  console.log('\n=== POST STATUS VALUES ===');
  const [ps] = await conn.query('SELECT post_status, COUNT(*) as cnt FROM x_tweets GROUP BY post_status ORDER BY cnt DESC LIMIT 10');
  ps.forEach(r => console.log(`  ${r.post_status}: ${r.cnt}`));

  await conn.end();
}

analyze().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
