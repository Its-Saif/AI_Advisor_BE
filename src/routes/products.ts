import { Router } from 'express';
const router = Router();

router.get('/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet', id: req.params.id });
});

export default router;