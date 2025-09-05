import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /products/categories - distinct categories
router.get('/categories', async (_req, res) => {
  const r = await query<{ category: string }>(
    `SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category <> '' ORDER BY category ASC`
  );
  res.json({ categories: r.rows.map(r => r.category) });
});

// GET /products
// Query params:
// - page (default 1), pageSize (default 10, max 50)
// - q (search in brand, product_name, description)
// - category (exact match)
// - sort: 'price_asc' | 'price_desc' | 'newest'
router.get('/', async (req, res) => {
  const all = String(req.query.all || 'false') === 'true';
  const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
  const pageSizeRaw = Math.max(parseInt(String(req.query.pageSize || '10'), 10) || 10, 1);
  const pageSize = Math.min(pageSizeRaw, 50);
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim();
  const sort = String(req.query.sort || 'newest');

  const where: string[] = [];
  const params: any[] = [];

  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push('(lower(brand) LIKE $' + params.length + ' OR lower(product_name) LIKE $' + params.length + ' OR lower(description) LIKE $' + params.length + ')');
  }
  if (category) {
    params.push(category);
    where.push('category = $' + params.length);
  }

  let orderBy = 'created_at DESC';
  if (sort === 'price_asc') orderBy = 'price ASC';
  if (sort === 'price_desc') orderBy = 'price DESC';

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  if (all) {
    const allRows = await query<any>(
      `SELECT id, brand, product_name, price, category, description, created_at
       FROM products
       ${whereSql}
       ORDER BY ${orderBy}`,
      params
    );
    const total = allRows.rows.length;
    return res.json({ page: 1, pageSize: total, total, totalPages: 1, items: allRows.rows });
  }

  // Count + paginated page
  const countRes = await query<{ count: string }>(`SELECT COUNT(*)::text as count FROM products ${whereSql}`, params);
  const total = parseInt(countRes.rows[0]?.count || '0', 10);
  params.push(pageSize);
  params.push((page - 1) * pageSize);
  const rows = await query<any>(
    `SELECT id, brand, product_name, price, category, description, created_at
     FROM products
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({ page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1, items: rows.rows });
});

// Placeholder by-id endpoint kept for future use
router.get('/:id', async (req, res) => {
  const r = await query<any>(
    'SELECT id, brand, product_name, price, category, description, created_at FROM products WHERE id = $1 LIMIT 1',
    [req.params.id]
  );
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(r.rows[0]);
});

export default router;