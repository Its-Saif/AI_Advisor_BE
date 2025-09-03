import { Router } from 'express';
import { z } from 'zod';
import { runProcessor } from '../agents/processor.js';
import { query } from '../db.js';
import { ChatOpenAI } from '@langchain/openai';

const router = Router();

const BodySchema = z.object({
  query: z.string().min(3),
  topK: z.number().int().min(1).max(10).optional()
});

const MODEL_CHAT = process.env.MODEL_CHAT || 'gpt-4o-mini';

router.post('/', async (req, res) => {
  const { sseInit, sseSend, sseClose } = (res as any);

  try {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { query: userQuery, topK = 5 } = parsed.data;

    sseInit();

    // Step: retrieving (vector search + selection)
    sseSend({ stage: 'retrieving', topK }, 'progress');

    const proc = await runProcessor(userQuery, topK);

    // Step: fetching product (DB)
    sseSend({ stage: 'fetching_product', best_product_id: proc.best_product_id }, 'progress');

    const resDb = await query(
      'SELECT * FROM products WHERE id = $1 LIMIT 1',
      [proc.best_product_id]
    );
    const product = resDb.rows[0];
    if (!product) {
      sseSend({ error: 'Product not found for best_product_id', id: proc.best_product_id }, 'error');
      return sseClose();
    }

    // Step: reasoning (stream tokens)
    sseSend({ stage: 'reasoning' }, 'progress');

    const llm = new ChatOpenAI({
      model: MODEL_CHAT,
      temperature: 0,
    });

    const system = [
      'You are a helpful AI advisor.',
      'Explain succinctly why the selected product best matches the user’s needs.',
      'Keep it 3–6 short bullet points or a concise paragraph.',
    ].join(' ');

    const messages = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: JSON.stringify({
          user_query: userQuery,
          selected_product: {
            id: product.id,
            brand: product.brand,
            product_name: product.product_name,
            price: product.price,
            category: product.category,
            description: product.description,
          },
        }),
      },
    ];

    let rationale = '';
    const stream = await llm.stream(messages);
    for await (const chunk of stream) {
      const piece = typeof chunk.content === 'string'
        ? chunk.content
        : Array.isArray(chunk.content)
          ? chunk.content.map((p: any) => p?.text || '').join('')
          : '';
      if (piece) {
        rationale += piece;
        sseSend({ token: piece }, 'tokens');
      }
    }

    sseSend({ product, rationale }, 'final');
    sseClose();
  } catch (e: any) {
    try {
      (res as any).sseSend?.({ error: e?.message || 'Unknown error' }, 'error');
      (res as any).sseClose?.();
    } catch {}
  }
});

export default router;