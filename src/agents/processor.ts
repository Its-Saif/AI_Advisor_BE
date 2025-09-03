import 'dotenv/config';
import { query } from '../db.js';
import { queryByText } from '../vector.js';
import { ChatOpenAI } from '@langchain/openai';

const MODEL_CHAT = process.env.MODEL_CHAT || 'gpt-4o-mini';

export type Candidate = {
  id: string;
  brand: string;
  product_name: string;
  price: number;
  category: string;
  description: string;
};

export type ProcessorResult = {
  best_product_id: string;
  rationale: string;
  rejected_reasons: Record<string, string>;
};

const llm = new ChatOpenAI({
  model: MODEL_CHAT,
  temperature: 0,
});

async function getProductsByIds(ids: string[]): Promise<Candidate[]> {
  if (!ids.length) return [];
  const params = ids.map((_, i) => `$${i + 1}`).join(',');
  const sql = `
    SELECT id, brand, product_name, price, category, description
    FROM products
    WHERE id IN (${params})
  `;
  const res = await query<Candidate>(sql, ids);
  // Preserve vector order: return in the order of ids
  const byId = new Map(res.rows.map(r => [r.id, r]));
  return ids.map(id => byId.get(id)).filter(Boolean) as Candidate[];
}

function coerceJson<T = any>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const json = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  return JSON.parse(json);
}

export async function vectorSearchWithDetails(userQuery: string, topK = 5): Promise<Candidate[]> {
  const { matches } = await queryByText(userQuery, topK);
  const ids = matches.map(m => m.id);
  return getProductsByIds(ids);
}

export async function runProcessor(userQuery: string, topK = 5): Promise<ProcessorResult> {
  const candidates = await vectorSearchWithDetails(userQuery, topK);

  const system = [
    'You are a product selection agent. From provided candidates (id + description), select exactly one best_product_id for the user’s query. Return strict JSON: {best_product_id, rationale, rejected_reasons}.',
  ].join(' ');

  const user = {
    query: userQuery,
    candidates: candidates.map(c => ({
      id: c.id,
      brand: c.brand,
      product_name: c.product_name,
      price: c.price,
      category: c.category,
      description: c.description,
    })),
    instruction: 'Pick the single best candidate. Keep rationale concise (<= 120 words).',
  };

  const msg = await llm.invoke([
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(user) },
  ]);

  const content = typeof msg.content === 'string'
    ? msg.content
    : Array.isArray(msg.content) ? msg.content.map((p: any) => p?.text || '').join('') : '';

  const parsed = coerceJson<ProcessorResult>(content);

  if (!parsed?.best_product_id || !parsed?.rationale) {
    throw new Error('Processor returned invalid JSON');
  }

  return parsed;
}
