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

`npm test` runs the unit and upload integration tests (Node's built-in test runner; the upload tests need the database running and use a temporary storage folder).

## Large PDF uploads

PDFs of any size are uploaded in **8 MB chunks** and indexed in the background:

1. `POST /api/uploads` starts an upload (checks free disk space).
2. The browser sends each chunk with `PUT /api/uploads/:id/chunks/:n` and an `X-Chunk-SHA256` header (3 in parallel, retried on network errors). The server streams each chunk to `storage/uploads/<id>/<n>.part`, checks its exact size and hash, and records it in `upload_chunks`. A chunk sent twice is ignored.
3. `POST /api/uploads/:id/complete` streams the parts in order into `storage/documents/<uuid>.pdf`, re-checks every part's hash, stores the whole-file SHA-256 and queues indexing. Missing chunks are reported (`409 { missing }`) and re-sent.
4. Indexing runs one document at a time in batches of 20 pages; `GET /api/documents` shows `indexedPages / pageCount`.

The progress bar shows real bytes (XHR upload events) and then real indexed pages. If an upload fails, **Retry** sends only the missing chunks. Picking the same file again after a reload also resumes, because the upload id is kept in `localStorage`. Unfinished uploads are deleted after 24 h (also: `npx tsx scripts/cleanup-uploads.ts`).

### Limits that still apply

| Layer | Limit | How it is handled |
|---|---|---|
| App | none by default | Optional `MAX_UPLOAD_BYTES` in `.env` |
| Requests | 8 MB per request | Next.js has no body limit for route handlers here (no `proxy.ts`). Behind nginx set `client_max_body_size 16m;` |
| Disk | free space | Checked before upload (needs 2× file size) and before assembly; `507` if short. In Docker, `storage/` must be a volume |
| Memory | upload, assembly and download stream (constant memory) | **Indexing** loads one whole PDF into RAM (pdf.js limitation), so only one document is indexed at a time. The server needs more free RAM than the largest PDF |
| Gemini | embedding rate limits | Batched calls with retry; progress shows indexing is still running |
| Browser | `crypto.subtle` needs HTTPS or `localhost` | Serve the app over HTTPS in production |
