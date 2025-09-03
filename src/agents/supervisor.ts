import 'dotenv/config';
import { query } from '../db.js';
import { runProcessor } from './processor.js';
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';

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
  const { best_product_id, rationale } = await runProcessor(state.query, 5);
  return { best_product_id, rationale };
}

async function fetchProductNode(state: SupervisorState) {
  if (!state.best_product_id) throw new Error('No best_product_id found');
  const res = await query<ProductRow>(
    'SELECT * FROM products WHERE id = $1 LIMIT 1',
    [state.best_product_id]
  );
  const product = res.rows[0];
  if (!product) throw new Error('Product not found in DB for id ' + state.best_product_id);
  return { product };
}

export const supervisorGraph = new StateGraph(SState)
  .addNode('processor', processorNode)
  .addNode('fetch_product', fetchProductNode)
  .addEdge(START, 'processor')
  .addEdge('processor', 'fetch_product')
  .addEdge('fetch_product', END)
  .compile();

// Convenience wrapper for non-streaming usage
export async function runSupervisor(queryText: string) {
  const result = await supervisorGraph.invoke({ query: queryText });
  return {
    product: result.product!,
    rationale: result.rationale!,
  };
}
