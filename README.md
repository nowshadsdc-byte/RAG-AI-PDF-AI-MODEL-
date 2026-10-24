# RAG Chat-with-PDF

A Next.js app for asking questions about text-based PDFs. Answers are grounded in retrieved passages and cite the source document and page.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` for Gemini requests. The included PostgreSQL password is for local development only.
3. Start Docker Desktop, then start PostgreSQL with pgvector:

   ```powershell
   npm run db:up
   ```

4. Generate and apply the Drizzle migration:

   ```powershell
   npm run db:generate
   npm run db:migrate
   ```

5. Start the app with `npm run dev`.

The database is exposed only on `127.0.0.1:5432` and persisted in the `postgres_data` Docker volume. To stop the container without deleting data, run `npm run db:down`.

## Useful checks

```powershell
npm run lint
npx tsc --noEmit
npm run test:gemini
```

The Gemini smoke test sends a small grounded prompt through the provider adapter. It requires `GEMINI_API_KEY` in the local `.env`; credentials are never committed.

The Drizzle schema is in `src/lib/db/schema.ts`. It defines users, documents, page-tagged document chunks with 768-dimensional embeddings, conversations, and messages with structured citations.
