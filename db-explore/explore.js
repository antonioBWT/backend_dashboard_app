const mysql = require('mysql2/promise');

const config = {
  host: 'mysql-8-parser.groupbwt.com',
  port: 3306,
  user: 'pwc-social-media-ro',
  password: 'mCgQLLn7Fz1rh75k',
  database: 'pwc-social-media',
  connectTimeout: 30000,
};

async function explore() {
  const conn = await mysql.createConnection(config);
  console.log('Connected!\n');

  // List all tables
  const [tables] = await conn.query('SHOW TABLES');
  console.log('=== TABLES ===');
  const tableNames = tables.map(r => Object.values(r)[0]);
  console.log(tableNames.join('\n'));

  // Describe each table
  for (const table of tableNames) {
    console.log(`\n=== DESCRIBE ${table} ===`);
    const [cols] = await conn.query(`DESCRIBE \`${table}\``);
    cols.forEach(c => console.log(`  ${c.Field} | ${c.Type} | ${c.Null} | ${c.Key} | ${c.Default}`));

    const [cnt] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${table}\``);
    console.log(`  → Rows: ${cnt[0].cnt}`);
  }

  await conn.end();
}

explore().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
