import "dotenv/config";
import { query } from "../db.js";
import { runProcessor } from "./processor.js";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { queryByText } from "../vector.js";
import { logger } from "../logger.js";

const MODEL_CHAT = process.env.MODEL_CHAT || "gpt-4o-mini";

export type Mode =
  | "SMALL_TALK"
  | "FOLLOWUP_QA"
  | "MORE_PRODUCTS"
  | "NEW_PRODUCT"
  | "NOT_AVAILABLE";

const llm = new ChatOpenAI({ model: MODEL_CHAT, temperature: 0 });

type ProductRow = {
  id: string;
  brand: string;
  product_name: string;
  price: number;
  category: string;
  description: string;
  created_at?: string;
};

type SupervisorState = {
  query: string;
  best_product_id?: string;
  rationale?: string;
  product?: ProductRow;
};

const SState = Annotation.Root({
  query: Annotation<string>,
  best_product_id: Annotation<string | undefined>,
  rationale: Annotation<string | undefined>,
  product: Annotation<ProductRow | undefined>,
});

async function processorNode(state: SupervisorState) {
  const { best_product_id, rationale } = await runProcessor(state.query, 3);
  return { best_product_id, rationale };
}

async function fetchProductNode(state: SupervisorState) {
  if (!state.best_product_id) throw new Error("No best_product_id found");
  const res = await query<ProductRow>(
    "SELECT * FROM products WHERE id = $1 LIMIT 1",
    [state.best_product_id]
  );
  const product = res.rows[0];
  if (!product)
    throw new Error("Product not found in DB for id " + state.best_product_id);
  return { product };
}

export const supervisorGraph = new StateGraph(SState)
  .addNode("processor", processorNode)
  .addNode("fetch_product", fetchProductNode)
  .addEdge(START, "processor")
  .addEdge("processor", "fetch_product")
  .addEdge("fetch_product", END)
  .compile();

export async function runSupervisor(queryText: string) {
  const result = await supervisorGraph.invoke({ query: queryText });
  return {
    product: result.product!,
    rationale: result.rationale!,
  };
}

export async function decideFlowLLM(input: {
  user_query: string;
  has_last_product: boolean;
  has_last_candidates: boolean;
  last_product?: ProductRow | null;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<Mode> {
  const system = [
    "You are a supervisor agent deciding conversation flow for a product advisor.",
    "Pick EXACTLY one: SMALL_TALK | FOLLOWUP_QA | MORE_PRODUCTS | NEW_PRODUCT | NOT_AVAILABLE.",
    "Definitions:",
    "- SMALL_TALK: greetings/thanks/chit-chat; respond politely and ask what product the user is looking for.",
    "- FOLLOWUP_QA: user asks about the last recommended product (ask/it/this/price/spec/features/etc.); answer about THAT product.",
    "- MORE_PRODUCTS: user asks for more/similar/alternatives based on the last recommendation; return remaining 2 alternatives.",
    "- NEW_PRODUCT: user asks for a different product altogether OR mentions a different product type/category than the last recommended product (e.g., last was a leg massager, user asks for a neck massager).",
    "- NOT_AVAILABLE: requested product/category is not available in the catalog (this may be set by the system when no matches are found).",
    'Return JSON only: {"mode":"..."}',
  ].join(" ");
  const fewshot = [
    { role: "system", content: system },
    {
      role: "user",
      content: JSON.stringify({
        user_query: "hi",
        has_last_product: false,
        has_last_candidates: false,
      }),
    },
    { role: "assistant", content: '{"mode":"SMALL_TALK"}' },
    {
      role: "user",
      content: JSON.stringify({
        user_query: "is there something better?",
        has_last_product: true,
        has_last_candidates: true,
      }),
    },
    { role: "assistant", content: '{"mode":"MORE_PRODUCTS"}' },
    {
      role: "user",
      content: JSON.stringify({
        user_query: "what is the price?",
        has_last_product: true,
        has_last_candidates: false,
      }),
    },
    { role: "assistant", content: '{"mode":"FOLLOWUP_QA"}' },
    {
      role: "user",
      content: JSON.stringify({
        user_query: "I need a foot massager",
        has_last_product: false,
        has_last_candidates: false,
      }),
    },
    { role: "assistant", content: '{"mode":"NEW_PRODUCT"}' },
    {
      role: "user",
      content: JSON.stringify({
        user_query: "And a neck massager?",
        has_last_product: true,
        has_last_candidates: true,
        last_product: {
          category: "Healthtech and Wellness",
          product_name: "Revive Foot & Leg Massager",
        },
      }),
    },
    { role: "assistant", content: '{"mode":"NEW_PRODUCT"}' },
    { role: "user", content: JSON.stringify(input) },
  ];
  const msg = await llm.invoke(fewshot);
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
  logger.info({ input, decision: parsed?.mode }, "supervisor.decideFlow");
  if (!parsed?.mode) throw new Error("Supervisor: invalid mode");
  return parsed.mode as Mode;
}

export async function fetchProductsByIds(ids: string[]): Promise<ProductRow[]> {
  if (!ids.length) return [];
  const params = ids.map((_, i) => `$${i + 1}`).join(",");
  const r = await query<ProductRow>(
    `SELECT * FROM products WHERE id IN (${params})`,
    ids
  );
  const byId = new Map(r.rows.map((row) => [row.id, row]));
  logger.info({ ids, count: r.rows.length }, "supervisor.fetchProducts");
  return ids.map((id) => byId.get(id)).filter(Boolean) as ProductRow[];
}

export async function top3ByQuery(userQuery: string): Promise<ProductRow[]> {
  const { matches } = await queryByText(userQuery, 3);
  const ids = matches.map((m) => m.id);
  logger.info({ userQuery, ids }, "supervisor.top3.ids");
  return fetchProductsByIds(ids);
}
