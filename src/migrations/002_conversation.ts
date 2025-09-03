import 'dotenv/config';
import { query, pool } from '../db.js';

async function up() {
  await query(`
    CREATE TABLE IF NOT EXISTS messages (
      id bigserial PRIMARY KEY,
      role text NOT NULL CHECK (role IN ('user','assistant')),
      content text NOT NULL,
      product jsonb,
      candidates jsonb,
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log('Migration 002_conversation applied.');
}

up()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
