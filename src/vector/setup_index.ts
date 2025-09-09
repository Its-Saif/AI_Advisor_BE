import "dotenv/config";
import { Pinecone } from "@pinecone-database/pinecone";

const INDEX_NAME = process.env.PINECONE_INDEX || "product-vectors";

const CLOUD = process.env.PINECONE_CLOUD || "aws";
const REGION = process.env.PINECONE_REGION || "us-east-1";

async function main() {
  if (!process.env.PINECONE_API_KEY)
    throw new Error("PINECONE_API_KEY not set");
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

  try {
    await pc.describeIndex(INDEX_NAME);
    console.log(`Index '${INDEX_NAME}' already exists.`);
  } catch {
    console.log(`Creating index '${INDEX_NAME}' ...`);
    await pc.createIndex({
      name: INDEX_NAME,
      dimension: 1536, // OpenAI text-embedding-3-small
      metric: "cosine",
      spec: {
        serverless: {
          cloud: CLOUD as "aws" | "gcp",
          region: REGION,
        },
      },
    });
    console.log(`Index '${INDEX_NAME}' created.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
