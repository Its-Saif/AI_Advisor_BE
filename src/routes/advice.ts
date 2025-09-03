import { Router } from 'express';
import { z } from 'zod';
// removed runProcessor; flow is decided by supervisor
import { query } from '../db.js';
import { ChatOpenAI } from '@langchain/openai';
import { saveMessage, getLastAssistantProduct, getLastAssistantCandidates, getRecentTurns } from '../conversation.js';
import { decideFlowLLM, top3ByQuery, fetchProductsByIds, type Mode } from '../agents/supervisor.js';
import { findRelevantProducts, pickBestOrNA } from '../agents/processor.js';
import { logger } from '../logger.js';

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
      logger.info({ body: req.body, userQuery, topK }, 'advice.request');
// Save user turn
await saveMessage({ role: 'user', content: userQuery });
// Open SSE
sseInit();

// Gather context
const lastProduct = await getLastAssistantProduct();
const lastCandidatesIds = await getLastAssistantCandidates();
const recentTurns = await getRecentTurns(6);

const recentMessages = recentTurns.map((r: any) => ({
    role: r.role as 'user' | 'assistant',
    content: String(r.content),
  }));
logger.info({ hasLastProduct: !!lastProduct, lastCandidatesIdsCount: lastCandidatesIds?.length || 0, recentMessages }, 'advice.context');
// Decide mode with supervisor LLM
const mode = await decideFlowLLM({
  user_query: userQuery,
  has_last_product: !!lastProduct,
  has_last_candidates: !!(lastCandidatesIds && lastCandidatesIds.length),
  last_product: lastProduct || null,
  recent_messages: recentMessages,
});
logger.info({ mode }, 'advice.mode');

sseSend({ stage: 'retrieving', mode }, 'progress');

// SMALL_TALK
if (mode === 'SMALL_TALK') {
  logger.info({ mode }, 'advice.branch.enter');
  sseSend({ stage: 'reasoning' }, 'progress');
  const llm = new ChatOpenAI({ model: MODEL_CHAT, temperature: 0.7 });
  let reply = '';
  const stream = await llm.stream([
    { role: 'system', content: 'You are a friendly assistant. Keep it brief. Ask what product the user is looking for.' },
    { role: 'user', content: userQuery },
  ]);
  for await (const chunk of stream) {
    const piece = typeof chunk.content === 'string'
      ? chunk.content
      : Array.isArray(chunk.content) ? chunk.content.map((p: any) => p?.text || '').join('') : '';
    if (piece) { reply += piece; sseSend({ token: piece }, 'tokens'); }
  }
  await saveMessage({ role: 'assistant', content: reply });
  logger.info({ mode, replyLength: reply.length }, 'advice.final');
  sseSend({ rationale: reply }, 'final');
  return sseClose();
}

// FOLLOWUP_QA
if (mode === 'FOLLOWUP_QA' && lastProduct) {
  logger.info({ mode }, 'advice.branch.enter');
  sseSend({ stage: 'reasoning' }, 'progress');
  const llm = new ChatOpenAI({ model: MODEL_CHAT, temperature: 0 });
  let reply = '';
  const stream = await llm.stream([
    { role: 'system', content: 'Answer ONLY using provided selected_product fields. If unknown, say you are not sure. Be concise.' },
    { role: 'user', content: JSON.stringify({ user_query: userQuery, selected_product: lastProduct, recent_messages: recentTurns }) },
  ]);
  for await (const chunk of stream) {
    const piece = typeof chunk.content === 'string'
      ? chunk.content
      : Array.isArray(chunk.content) ? chunk.content.map((p: any) => p?.text || '').join('') : '';
    if (piece) { reply += piece; sseSend({ token: piece }, 'tokens'); }
  }
  await saveMessage({ role: 'assistant', content: reply });
  logger.info({ mode, productId: lastProduct.id, replyLength: reply.length }, 'advice.final');
  sseSend({ rationale: reply, product: lastProduct }, 'final');
  return sseClose();
}

// MORE_PRODUCTS
if (mode === 'MORE_PRODUCTS' && lastProduct) {
  logger.info({ mode }, 'advice.branch.enter');
  // Use previously stored top-3 if available; otherwise recompute
  const baseIds = lastCandidatesIds?.length
    ? lastCandidatesIds
    : (await top3ByQuery(`${lastProduct.category} ${lastProduct.product_name}`)).map(p => p.id);

  const remainingIds = baseIds.filter(id => id !== lastProduct.id).slice(0, 2);
  const candidates = await fetchProductsByIds(remainingIds);

  sseSend({ stage: 'reasoning' }, 'progress');
  const llm = new ChatOpenAI({ model: MODEL_CHAT, temperature: 0 });
  let rationale = '';
  const stream = await llm.stream([
    { role: 'system', content: 'Briefly compare these alternatives to the previously suggested product. Be concise.' },
    { role: 'user', content: JSON.stringify({ previous_product: lastProduct, candidates }) },
  ]);
  for await (const chunk of stream) {
    const piece = typeof chunk.content === 'string'
      ? chunk.content
      : Array.isArray(chunk.content) ? chunk.content.map((p: any) => p?.text || '').join('') : '';
    if (piece) { rationale += piece; sseSend({ token: piece }, 'tokens'); }
  }
  await saveMessage({ role: 'assistant', content: rationale, candidates });
  logger.info({ mode, candidateIds: candidates.map(c => c.id) }, 'advice.final');
  sseSend({ candidates, rationale }, 'final');
  return sseClose();
}

// NEW_PRODUCT (default)
logger.info({ mode: 'NEW_PRODUCT' }, 'advice.branch.enter');
sseSend({ stage: 'fetching_product' }, 'progress');
// Try relevant filtering first to avoid off-topic picks
let top3 = await findRelevantProducts(userQuery, 3, 0.70);
if (!top3.length) {
  // Fallback to plain top3ByQuery
  const plain = await top3ByQuery(userQuery);
  top3 = plain as any;
}
if (!top3.length) {
  // Send a polite NOT_AVAILABLE response
  sseSend({ stage: 'reasoning' }, 'progress');
  const llm = new ChatOpenAI({ model: MODEL_CHAT, temperature: 0.7 });
  let reply = '';
  const stream = await llm.stream([
    { role: 'system', content: 'Politely tell the user the requested product is not available right now, and that it will be added soon. Ask if they want suggestions from related categories.' },
    { role: 'user', content: userQuery },
  ]);
  for await (const chunk of stream) {
    const piece = typeof chunk.content === 'string'
      ? chunk.content
      : Array.isArray(chunk.content) ? chunk.content.map((p: any) => p?.text || '').join('') : '';
    if (piece) { reply += piece; sseSend({ token: piece }, 'tokens'); }
  }
  await saveMessage({ role: 'assistant', content: reply });
  logger.info({ mode: 'NOT_AVAILABLE' }, 'advice.final');
  sseSend({ rationale: reply }, 'final');
  return sseClose();
}

// Give the LLM veto power if these don't actually match
const pick = await pickBestOrNA(userQuery, top3 as any);
if (pick.not_available === true) {
  sseSend({ stage: 'reasoning' }, 'progress');
  const llmNA = new ChatOpenAI({ model: MODEL_CHAT, temperature: 0.7 });
  let replyNA = '';
  const streamNA = await llmNA.stream([
    { role: 'system', content: 'Politely tell the user the requested product is not available right now, and that it will be added soon. Ask if they want suggestions from related categories.' },
    { role: 'user', content: userQuery },
  ]);
  for await (const chunk of streamNA) {
    const piece = typeof chunk.content === 'string'
      ? chunk.content
      : Array.isArray(chunk.content) ? chunk.content.map((p: any) => p?.text || '').join('') : '';
    if (piece) { replyNA += piece; sseSend({ token: piece }, 'tokens'); }
  }
  await saveMessage({ role: 'assistant', content: replyNA });
  logger.info({ mode: 'NOT_AVAILABLE', reason: pick.reason }, 'advice.final');
  sseSend({ rationale: replyNA }, 'final');
  return sseClose();
}
const product = top3[0];

sseSend({ stage: 'reasoning' }, 'progress');
const llm = new ChatOpenAI({ model: MODEL_CHAT, temperature: 0 });
let rationale = '';
const stream = await llm.stream([
  { role: 'system', content: 'Provide a concise rationale for why this product fits the user request.' },
  { role: 'user', content: JSON.stringify({ user_query: userQuery, selected_product: product }) },
]);
for await (const chunk of stream) {
  const piece = typeof chunk.content === 'string'
    ? chunk.content
    : Array.isArray(chunk.content) ? chunk.content.map((p: any) => p?.text || '').join('') : '';
  if (piece) { rationale += piece; sseSend({ token: piece }, 'tokens'); }
}
await saveMessage({ role: 'assistant', content: rationale, product, candidates: top3 });
logger.info({ mode: 'NEW_PRODUCT', productId: product.id }, 'advice.final');
sseSend({ product, rationale }, 'final');
return sseClose();
  } catch (e: any) {
    try {
      logger.error({ err: e, stack: e?.stack }, 'advice.error');
      (res as any).sseSend?.({ error: e?.message || 'Unknown error' }, 'error');
      (res as any).sseClose?.();
    } catch {}
  }
});

export default router;