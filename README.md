AI Advisor Backend - Setup and Docker Runbook

Environment variables (required)
.env.example file is place, just create a .env file from that

Local (without Docker)

1. Start Postgres (via compose):
   docker compose up -d postgres adminer
2. Create .env in this directory and set variables above. For local DB, use:
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_advisor
3. Install deps and run setup:
   npm ci
   npm run migrate:all
   npm run vector:setup
   npm run ingest
4. Run the API:
   npm run dev

Dockerized

1. Prepare a .env file in this directory.
2. Run this command - docker compose up -d --build
3. Verify health:
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
