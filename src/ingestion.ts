import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { query, pool } from './db.js';
import { embedText, upsertEmbedding } from './vector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SkuSchema = z.object({
  brand: z.string(),
  product_name: z.string(),
  price: z.number(),
  category: z.string(),
  description: z.string(),
});
type Sku = z.infer<typeof SkuSchema>;

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function shortHash(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
}

function makeStableId(sku: Sku): string {
  const base = `${slugify(sku.brand)}-${slugify(sku.product_name)}`;
  const h = shortHash(`${sku.brand}|${sku.product_name}|${sku.description}`);
  return `${base}-${h}`;
}

async function readSkus(): Promise<Sku[]> {
  const p = path.resolve(__dirname, '../skus.json');
  const raw = await fs.readFile(p, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('skus.json must be an array');
  const result: Sku[] = [];
  for (const item of parsed) {
    const r = SkuSchema.safeParse(item);
    if (!r.success) {
      console.warn('Skipping invalid item:', r.error.flatten());
      continue;
    }
    result.push(r.data);
  }
  return result;
}

async function upsertProductRow(id: string, sku: Sku) {
  await query(
    `
    INSERT INTO products (id, brand, product_name, price, category, description)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE
    SET brand = EXCLUDED.brand,
        product_name = EXCLUDED.product_name,
        price = EXCLUDED.price,
        category = EXCLUDED.category,
        description = EXCLUDED.description
    `,
    [id, sku.brand, sku.product_name, sku.price, sku.category, sku.description]
  );
}

export async function ingestAll() {
  const skus = await readSkus();
  let ok = 0;
  const errors: { id?: string; error: string }[] = [];

  for (const sku of skus) {
    const id = makeStableId(sku);
    try {
      // DB upsert
      await upsertProductRow(id, sku);

      // Vector upsert (embedding of description)
      const vec = await embedText(sku.description);
      await upsertEmbedding(id, vec, {
        brand: sku.brand,
        category: sku.category,
        price: sku.price,
      });

      ok += 1;
    } catch (e: any) {
      errors.push({ id, error: e?.message || String(e) });
    }
  }

  return { total: skus.length, succeeded: ok, failed: errors.length, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ingestAll()
    .then(async (res) => {
      console.log('Ingestion complete:', res);
    })
    .catch((e) => {
      console.error('Ingestion failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await pool.end();
    });
}
