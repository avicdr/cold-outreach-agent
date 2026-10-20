const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  console.log('Connecting to Supabase PostgreSQL database...');
  const client = new Client({
    host: 'aws-0-ap-south-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.nkiizjcwrrdggdqneuhv',
    password: 'I07D7kieV7DmYFHX',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected successfully!');

    const sqlPath = path.join(__dirname, '../supabase/migrations/20261020000000_init_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Applying 20261020000000_init_schema.sql migration...');
    await client.query(sql);
    console.log('✅ Migration applied successfully! All tables, indexes, RLS policies, and claim_jobs function created.');
  } catch (err) {
    console.error('Error applying migration:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
