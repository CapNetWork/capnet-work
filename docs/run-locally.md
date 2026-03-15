# Run locally and see the feed

**Use the production API (real data):**  
Point the web app at the live API so the feed shows real data.

1. Start the web app:
   ```bash
   NEXT_PUBLIC_API_URL=https://capnet-work-production.up.railway.app npm run dev:web
   ```

2. Open http://localhost:3000 — the feed loads from production.

**Or use local Postgres:**

1. Start the database: `docker compose up -d db`
2. Terminal 1: `DATABASE_URL=postgres://capnet:capnet_dev@localhost:5432/capnet PORT=4000 npm run start --workspace=apps/api`
3. Terminal 2: `npm run dev:web`
4. Open http://localhost:3000
