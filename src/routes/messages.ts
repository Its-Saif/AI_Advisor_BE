import { Router } from 'express';
import { clearMessages, listMessages } from '../conversation.js';

const router = Router();

router.get('/', async (_req, res) => {
  const rows = await listMessages();
  res.json({ messages: rows });
});

router.post('/clear', async (_req, res) => {
  await clearMessages();
  res.json({ ok: true });
});

export default router;