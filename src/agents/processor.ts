import "dotenv/config";
import { query } from "../db.js";
import { queryByText } from "../vector.js";
import { ChatOpenAI } from "@langchain/openai";
import { logger } from "../logger.js";

const MODEL_CHAT = process.env.MODEL_CHAT || "gpt-4o-mini";

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
  const params = ids.map((_, i) => `$${i + 1}`).join(",");
  const sql = `
    SELECT id, brand, product_name, price, category, description
    FROM products
    WHERE id IN (${params})
  `;
  const res = await query<Candidate>(sql, ids);

  const byId = new Map(res.rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as Candidate[];
}

function coerceJson<T = any>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const json = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  return JSON.parse(json);
}

export async function vectorSearchWithDetails(
  userQuery: string,
  topK = 3
): Promise<Candidate[]> {
  const { matches } = await queryByText(userQuery, topK);
  const ids = matches.map((m) => m.id);
  return getProductsByIds(ids);
}

export async function runProcessor(
  userQuery: string,
  topK = 5
): Promise<ProcessorResult> {
  const candidates = await vectorSearchWithDetails(userQuery, topK);
  logger.info({ count: candidates.length }, "Processor: candidates fetched");

  const system = [
    "You are a product selection agent. From provided candidates (id + description), select exactly one best_product_id for the user’s query. Return strict JSON: {best_product_id, rationale, rejected_reasons}.",
  ].join(" ");

  const user = {
    query: userQuery,
    candidates: candidates.map((c) => ({
      id: c.id,
      brand: c.brand,
      product_name: c.product_name,
      price: c.price,
      category: c.category,
      description: c.description,
    })),
    instruction:
      "Pick the single best candidate. Keep rationale concise (<= 120 words).",
  };

  const msg = await llm.invoke([
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(user) },
  ]);

  const content =
    typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
      ? msg.content.map((p: any) => p?.text || "").join("")
      : "";

  const parsed = coerceJson<ProcessorResult>(content);
  logger.info({ parsed }, "Processor: best selection");
  if (!parsed?.best_product_id || !parsed?.rationale) {
    throw new Error("Processor returned invalid JSON");
  }

  return parsed;
}

function extractKeywords(text: string): string[] {
  const stop = new Set([
    "i",
    "need",
    "a",
    "an",
    "the",
    "for",
    "with",
    "and",
    "or",
    "of",
    "to",
    "me",
    "my",
    "is",
    "there",
    "something",
    "better",
    "about",
    "on",
    "in",
    "it",
    "this",
    "that",
    "looking",
    "want",
    "would",
    "like",
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w))
    .slice(0, 8);
}

function productText(p: Candidate): string {
  return `${p.brand} ${p.product_name} ${p.category} ${p.description}`.toLowerCase();
}

function isRelevant(p: Candidate, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const text = productText(p);
  return keywords.some((k) => text.includes(k));
}

export async function findRelevantProducts(
  userQuery: string,
  topK = 3,
  minScore = 0.7
): Promise<Candidate[]> {
  const { matches } = await queryByText(userQuery, Math.max(8, topK + 4));
  const filtered = (matches || []).filter(
    (m) => typeof m.score === "number" && (m.score as number) >= minScore
  );
  const ids = filtered.map((m) => m.id);
  logger.info(
    { userQuery, minScore, ids, scores: filtered.map((m) => m.score) },
    "Processor: preFetch relevant"
  );
  if (ids.length === 0) return [];
  const products = await getProductsByIds(ids);
  const keywords = extractKeywords(userQuery);
  const relevant = products
    .filter((p) => isRelevant(p, keywords))
    .slice(0, topK);
  logger.info({ kept: relevant.map((r) => r.id) }, "Processor: relevant final");
  return relevant;
}

export type ProcessorPickDecision = {
  best_product_id?: string;
  rationale?: string;
  not_available?: boolean;
  reason?: string;
};

export async function pickBestOrNA(
  userQuery: string,
  candidates: Candidate[]
): Promise<ProcessorPickDecision> {
  const system = [
    "You are a strict product selector. From candidates, choose the single best product ONLY if it truly matches the user request.",
    "If none match, return NOT AVAILABLE instead of forcing a pick.",
    "Return STRICT JSON ONLY in one of the two shapes:",
    '{"best_product_id":"...","rationale":"..."} OR {"not_available":true,"reason":"..."}',
  ].join(" ");

  const payload = {
    query: userQuery,
    candidates: candidates.map((c) => ({
      id: c.id,
      brand: c.brand,
      product_name: c.product_name,
      category: c.category,
      price: c.price,
      description: c.description,
    })),
  };

  const msg = await llm.invoke([
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(payload) },
  ]);

  const text =
    typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
      ? msg.content.map((p: any) => p?.text || "").join("")
      : "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const parsed = JSON.parse(
    start >= 0 && end > start ? text.slice(start, end + 1) : text
  );
  logger.info({ decision: parsed }, "Processor: pickBestOrNA");
  if (parsed?.not_available === true)
    return { not_available: true, reason: parsed?.reason || "not suitable" };
  if (parsed?.best_product_id)
    return {
      best_product_id: parsed.best_product_id,
      rationale: parsed?.rationale,
    };
  return { not_available: true, reason: "no valid selection" };
}
