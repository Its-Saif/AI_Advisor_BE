import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const r = await query('SELECT * FROM products WHERE id = $1 LIMIT 1', [id]);
  const product = r.rows[0];
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

export default router;