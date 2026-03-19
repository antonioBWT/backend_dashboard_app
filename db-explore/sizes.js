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

  // Table sizes
  console.log('=== TABLE SIZES ===');
  const [sizes] = await conn.query(`
    SELECT table_name,
      ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb,
      table_rows
    FROM information_schema.TABLES
    WHERE table_schema = 'pwc-social-media'
    ORDER BY (data_length + index_length) DESC
  `);
  sizes.forEach(r => console.log(`  ${r.table_name}: ${r.size_mb} MB (~${r.table_rows} rows)`));

  // More detailed tweet text samples per theme
  console.log('\n=== TWEETS SAMPLE BY THEME ===');
  const [themes] = await conn.query(`
    SELECT DISTINCT q.theme, q.policy
    FROM x_search_queries q
    WHERE q.theme IS NOT NULL AND q.country = 'UAE'
    GROUP BY q.theme, q.policy
    ORDER BY q.theme
    LIMIT 20
  `);
  themes.forEach(r => console.log(`  [${r.theme}] ${r.policy}`));

  // Monthly tweet volume for last 2 years
  console.log('\n=== MONTHLY VOLUME (2024-2026) ===');
  const [monthly] = await conn.query(`
    SELECT DATE_FORMAT(t.date_published, '%Y-%m') as month,
           q.theme,
           COUNT(*) as cnt,
           SUM(t.likes_count) as likes,
           SUM(t.views_count) as views
    FROM x_tweets t
    JOIN x_search_queries q ON t.query_id = q.id
    WHERE t.date_published >= '2024-01-01'
      AND q.theme IS NOT NULL
    GROUP BY month, q.theme
    ORDER BY month DESC, cnt DESC
    LIMIT 40
  `);
  monthly.forEach(r => console.log(`  ${r.month} | ${r.theme}: ${Number(r.cnt).toLocaleString()} tweets | ${Number(r.likes).toLocaleString()} likes | ${Number(r.views).toLocaleString()} views`));

  // Top authors by engagement
  console.log('\n=== TOP AUTHORS BY ENGAGEMENT ===');
  const [authors] = await conn.query(`
    SELECT t.author,
           COUNT(*) as tweet_count,
           SUM(t.likes_count) as total_likes,
           SUM(t.views_count) as total_views
    FROM x_tweets t
    JOIN x_search_queries q ON t.query_id = q.id
    WHERE q.country = 'UAE' AND t.date_published >= '2024-01-01'
    GROUP BY t.author
    ORDER BY total_views DESC
    LIMIT 15
  `);
  authors.forEach(r => console.log(`  @${r.author}: ${r.tweet_count} tweets | ${Number(r.total_likes).toLocaleString()} likes | ${Number(r.total_views).toLocaleString()} views`));

  await conn.end();
}

analyze().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
