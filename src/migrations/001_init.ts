import 'dotenv/config';
import { pool, query } from '../db.js';

async function up() {
  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id text PRIMARY KEY,
      brand text,
      product_name text,
      price integer,
      category text,
      description text,
      created_at timestamptz default now()
    );
  `);
  console.log('Migration 001_init applied.');
}

up()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });