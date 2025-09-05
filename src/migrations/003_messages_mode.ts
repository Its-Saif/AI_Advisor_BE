import 'dotenv/config';
import { query, pool } from '../db.js';

async function up() {
  await query(`
    ALTER TABLE IF EXISTS messages
    ADD COLUMN IF NOT EXISTS mode text
  `);
  console.log('Migration 003_messages_mode applied.');
}

up()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });



