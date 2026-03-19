const mysql = require('mysql2/promise');

const config = {
  host: 'mysql-8-parser.groupbwt.com',
  port: 3306,
  user: 'pwc-social-media-ro',
  password: 'mCgQLLn7Fz1rh75k',
  database: 'pwc-social-media',
  connectTimeout: 30000,
};

async function test() {
  const conn = await mysql.createConnection(config);
  console.log('Connected');

  console.time('overview 2026');
  const [rows] = await conn.query(`
    SELECT
      COUNT(t.id) as totalTweets,
      SUM(t.likes_count) as totalLikes,
      SUM(t.retweets_count) as totalRetweets,
      SUM(t.views_count) as totalViews,
      COUNT(DISTINCT t.author) as uniqueAuthors,
      SUM(CASE WHEN t.post_status = 'original post' THEN 1 ELSE 0 END) as originalPosts,
      SUM(CASE WHEN t.post_status = 'reply' THEN 1 ELSE 0 END) as replies,
      SUM(CASE WHEN t.post_status = 'quote tweet' THEN 1 ELSE 0 END) as quoteTweets
    FROM x_tweets t
    JOIN x_search_queries q ON t.query_id = q.id
    WHERE t.date_published IS NOT NULL
      AND q.country = 'UAE'
      AND t.date_published >= '2026-01-01'
  `);
  console.timeEnd('overview 2026');
  console.log(rows[0]);

  await conn.end();
}

test().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
