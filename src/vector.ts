import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';

const INDEX_NAME = process.env.PINECONE_INDEX || 'product_vectors';

if (!process.env.PINECONE_API_KEY) throw new Error('PINECONE_API_KEY not set');
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-3-small', // 1536-dim
});

function getIndex() {
  return pc.index(INDEX_NAME);
}

export async function embedText(text: string): Promise<number[]> {
  return embeddings.embedQuery(text);
}

export async function upsertEmbedding(
  id: string,
  values: number[],
  metadata?: Record<string, any>
): Promise<void> {
  const index = getIndex();
  await index.upsert([
    {
      id,
      values,
      metadata,
    },
  ]);
}

export type QueryMatch = {
  id: string;
  score?: number;
  metadata?: Record<string, any>;
};

export async function queryByText(
  text: string,
  topK = 5,
  filter?: Record<string, any>
): Promise<{ matches: QueryMatch[] }> {
  const index = getIndex();
  const vector = await embedText(text);
  const res = await index.query({
    vector,
    topK,
    includeMetadata: true,
    filter,
  });
  const matches = (res.matches || []).map((m: any) => ({
    id: m.id,
    score: m.score,
    metadata: m.metadata,
  }));
  return { matches };
}
