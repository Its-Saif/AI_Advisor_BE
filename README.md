AI Advisor Backend - Setup and Docker Runbook

Environment variables (required)
- DATABASE_URL: postgres connection string
- OPENAI_API_KEY: OpenAI API key
- MODEL_CHAT: optional, default gpt-4o-mini
- PINECONE_API_KEY: Pinecone API key
- PINECONE_INDEX: optional, default product-vectors
- PINECONE_REGION: optional, default us-east-1
- PINECONE_CLOUD: optional, default aws
- PORT: optional, default 3000
- LOG_LEVEL: optional, default info

Local (without Docker)
1) Start Postgres (via compose):
   docker compose up -d postgres adminer
2) Create .env in this directory and set variables above. For local DB, use:
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_advisor
3) Install deps and run setup:
   npm ci
   npm run migrate:all
   npm run vector:setup
   npm run ingest
4) Run the API:
   npm run dev

Dockerized
1) Prepare a .env file in this directory (same keys as above). For compose, the api will use:
   DATABASE_URL=postgres://postgres:postgres@postgres:5432/ai_advisor
2) Build and start services:
   docker compose up -d --build postgres adminer api
3) Run one-time setup (migrations, vector index, ingestion):
   docker compose run --rm api sh -lc "npm run setup"
4) Verify health:
   curl http://localhost:3000/health

Useful commands
- Open DB shell:
  npm run db:psql
- Recreate Pinecone index (idempotent):
  npm run vector:setup
- Reingest products and embeddings:
  npm run ingest

Notes
- Adminer dashboard: http://localhost:8080 (System: PostgreSQL, Server: postgres, User: postgres, Password: postgres, DB: ai_advisor)
- Skus data comes from skus.json; modify and re-run npm run ingest to refresh.


