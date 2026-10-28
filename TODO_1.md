# TODO — RAG Chat-with-PDF

> 1 hour/day · Full plan: `docs/RAG_Project_Plan.xlsx` · Rules: `CLAUDE.md`
> End of every session: lint + typecheck → commit → update this file → mark task Done in the spreadsheet.

## Next
- **Week 6: Auth & privacy** — T36 done (login/register, default user, session user, 401 + `/login` redirect). Next: T38 data-scoping audit, then T39–T40 in `TODO_W6.md`.
- After a fresh DB / new machine: `npm run db:seed` creates the default account from `.env`.
- Copy the 12 rows from `docs/eval/results.md` into the spreadsheet's Eval Log, and mark T09, T12, T14, T18, T19 Done there.
- Review leftovers (not urgent): header/footer removal can drop repeated table rows and Bangla page numbers (`src/lib/clean.ts`); no request timeout on Gemini embeddings; tokens-per-word estimate assumes English.

## Session — 28 Oct 2026 — Earlier-week leftovers (T09, T12, T14, T18, T19) ✅
- Samples in `samples/` (gitignored): `research-paper.pdf` (arXiv 1706.03762, 15 pages), `lecture-notes.pdf` (Stanford CS229 notes, 278 pages), `scanned.pdf` (3 image-only pages made with PIL).
- **T09/T12:** all `try-chunk` checks pass — paper 22 chunks (1.47/page), notes 289 chunks (1.04/page), scanned → "no text" ✅.
- **Bug found + fixed:** the 278-page PDF failed at page 40 with Gemini free-tier `429` (30k embedding tokens/minute). `src/lib/ai/gemini.ts` now uses batches of 20 (≈ 12k tokens) instead of 50, waits the delay Gemini suggests ("retry in 16 s") and fails fast on the *daily* quota. Notes then indexed in 250 s. New `scripts/reindex.ts <documentId>` re-indexes a failed document from the terminal.
- **T14:** `rag-reviewer` on Week 2 code → fixed: batch size, daily quota, near-empty pages (< 20 chars) no longer become chunks, hyphen join only before a lowercase letter (`COVID-\n19` → `COVID-19`). +2 tests; `npm test` 21/21, lint, `tsc` ✅.
- **T18:** new `scripts/eval.ts` + `docs/eval/questions.json` (10 answerable + 2 "not found" questions) → `docs/eval/results.md`: retrieval hit 10/10, correct citation 9/10, "not found" 2/2, median 1.9 s. The one miss (Q2, expected p.7) cited p.8 + p.2, which state the same fact ("8 P100 GPUs") — answer faithful.
- **T19:** no tuning — 10/10 hits is no evidence for changing chunk size / top-k. Defaults stay.
- **Upload UI checked in a real browser** (headless Chrome via Playwright): 79 MB PDF at 3 MB/s → offline at 24 MB → card shows "Network error." + Retry → back online, Retry → "Resuming upload…" from 31% (not 0) → server SHA-256 identical to source → indexing shows the friendly "no selectable text" error. Test document deleted afterwards.

## Session — 25 Oct 2026 — Large PDF uploads ✅
- Chunked, resumable uploads (8 MB chunks, SHA-256 per chunk, 3 parallel, retry) → `src/lib/uploads.ts`, `src/lib/upload-client.ts`, `app/api/uploads/**`. No app size limit (optional `MAX_UPLOAD_BYTES`); disk space checked.
- Indexing is now a background queue (one document at a time, 20-page batches, `documents.status / indexed_pages`) → `src/lib/index-queue.ts`, `src/lib/ingest.ts`; restarted after a server restart via `instrumentation.ts`. Failed documents have a "retry indexing" button.
- UI: one progress card per upload with real %, bytes, speed, phases (uploading → assembling → indexing page x/y → ready), Retry and Cancel.
- DB: new `uploads`, `upload_chunks` tables; new `documents` columns; `storage_path` is now relative to `STORAGE_DIR`.
- Tested: `npm test` 18/18 (upload integration tests: out-of-order + duplicate chunks, bad hash, oversize, missing chunk, concurrent complete, other user, cleanup). 1 GB PDF over HTTP: interrupted after 42/126 chunks, resumed sending only 84, SHA-256 identical to source, server memory flat (~0.5 GB) during upload, ~1.8 GB peak only while pdf.js indexed it.
- Not yet checked by hand: the progress UI in a real browser (DevTools "Offline" mid-upload → Retry).

## Session — 25 Oct 2026 — W3–W5 code ✅
- **W3 indexing & retrieval:** `src/lib/ingest.ts` (extract → clean → chunk → embed → save file as `storage/documents/<uuid>.pdf` → one DB transaction), `src/lib/search.ts` (cosine `<=>` top-5, HNSW index already migrated, filtered by `user_id`), `scripts/ingest.ts`, `scripts/ask.ts "<q>" --search`.
- **W4 cited answers:** `src/lib/answer.ts` → `{ answer, citations: [{ documentId, documentName, page }] }`. The prompt asks the model to cite `[n]`; markers are mapped back to document + page (unknown numbers ignored). "Not found" → no citations.
- **W5 web UI:** shadcn/ui (base-nova) set up under `src/components`; `src/components/chat-app.tsx` (upload, document list with tick-to-filter, delete, chat with citation badges that open the PDF at `#page=N`). API: `GET/POST /api/documents`, `DELETE /api/documents/:id`, `GET /api/documents/:id/file`, `POST /api/chat` — all scoped by user id, 404 for other users' ids.
- **Temporary:** until W6 every request uses one local dev user (`dev@localhost`, unusable password hash).
- Tested: OSHA guide ingest 2.5 s; "When was OSHA created?" → 1970, cites p. 3 ✅; "capital of France?" → not found, no citations ✅; API upload / blank PDF 422 / non-PDF 415 / bad id 404 / delete removes chunks + file ✅; lint, `tsc`, `next build` ✅.
- Problems: InferX (DeepSeek) often returns `429 all replicas at capacity` even after 3 retries; answers take 5–15 s. Watch against the ≤ 5 s target; Qwen/Ollama in W7 is the fallback.

## Earlier session — 25 Oct 2026 — Week 2 code (T08–T13) ✅
- Done: `src/lib/extract.ts` (unpdf, page by page, `NoTextError`, pages < 20 chars flagged empty), `src/lib/clean.ts` (hyphen join, whitespace, repeated header/footer lines), `src/lib/chunk.ts` (per page, ~600 tokens / 80 overlap, `words × 1.33`), `embed()` now batches 50 per call, retries 429/503 and takes `"document" | "query"` task type (kept in `src/lib/ai/gemini.ts` behind `lib/ai`, not a separate `embed.ts`).
- Scripts: `scripts/try-extract.ts <pdf> [--raw]`, `scripts/try-chunk.ts <pdf>` (runs the T12 checks), `npm run test:gemini` (now also tests batching + query embeddings).
- Tested: 31-page OSHA trainer guide → 32 chunks, 1.07/page, all checks pass; blank PDF → "no text" ✅; 60-text batch → 60 × 768 ✅.
- Problems: header removal only catches lines on ≥ 60% of pages — the OSHA guide's header changes in the appendix, so it stays. Fine for now; revisit only if retrieval suffers.

## This week — Week 2: Extraction & Chunking (1 – 7 Nov)
**Goal:** a PDF turns into clean, page-tagged chunks with 768-dim embeddings (in memory, not yet saved to the DB).

- [x] **T08 · Sun 1 Nov — PDF text extraction**
  - `npm i unpdf`; write `lib/extract.ts` → `[{ page, text }]`
  - `scripts/try-extract.ts` prints page count + first 200 chars of each page
  - ✅ Done when: text prints per page for one PDF

- [x] **T09 · Mon 2 Nov — Test extraction on 3 PDFs**
  - Put test files in `samples/` (gitignored): lecture notes, research paper, scanned PDF
  - Flag pages with < 20 characters as empty; if all pages are empty → throw `NoTextError`
  - ✅ Done when: the scanned PDF is reported as "no text"

- [x] **T10 · Tue 3 Nov — Text cleaning**
  - `lib/clean.ts`: collapse whitespace, join hyphenated line breaks (`informa-\ntion` → `information`), trim
  - Optional: drop a line repeated on most pages (header/footer)
  - ✅ Done when: output looks clean on all 3 PDFs

- [x] **T11 · Wed 4 Nov — Chunker**
  - `lib/chunk.ts` → `[{ pageNumber, chunkIndex, content }]`
  - ~600 tokens, 80 overlap; estimate tokens as `words × 1.33`; chunk **per page** so each chunk has one page number
  - ✅ Done when: chunks print with page numbers

- [x] **T12 · Thu 5 Nov — Test chunker**
  - Check: no empty chunks, overlap present, page numbers correct, no chunk over ~800 tokens
  - Log chunk count per sample PDF in Quick notes below
  - ✅ Done when: counts look sensible (≈ 1–2 chunks per page)

- [x] **T13 · Fri 6 Nov — Embedding function**
  - `lib/ai/embed.ts` using the Gemini embedding model, output dimensionality **768**
  - Batch requests (e.g. 50 per call), retry with a short wait on rate-limit (429)
  - Use separate task types for documents vs. questions if the API supports it
  - ✅ Done when: `embed(["hello"])` returns one vector of length 768

- [x] **T14 · Sat 7 Nov — Buffer / review**
  - Finish anything unfinished; run the `rag-reviewer` agent on the week's code
  - Lint + typecheck, commit, plan Week 3
  - ✅ Done when: Week 2 complete & committed

## Milestones
- [x] W1 Setup — app + DB running
- [x] W2 Extraction & chunking — page-tagged chunks + embeddings
- [x] W3 Indexing & retrieval — top-5 chunks with pages in terminal _(T18: 10/10 hits, 9/10 citations)_
- [x] W4 LLM & UI shell — cited answer / "not found" in terminal
- [x] W5 Web UI & chat — chat with a PDF in the browser
- [ ] **W6 Auth & privacy — users isolated** ← you are here
- [ ] W7 History & providers — MVP feature-complete, Qwen adapter
- [ ] W8 Evaluation & deploy — numbers recorded, Docker Compose, demo-ready

## Coming next week — Week 3: Indexing & Retrieval (8 – 14 Nov)
T15 ingestion script → T16 HNSW index → T17 similarity search → T18 10-question retrieval test → T19 tune chunk size / top-k → T20 grounded prompt → T21 buffer

## Blocked
- _(none)_

## Ideas / later (out of v1 scope — don't build yet)
- OCR for scanned PDFs
- Hybrid BM25 + vector search, re-ranking

## Quick notes
- Defaults: chunk 600 tokens / 80 overlap · 768-dim embeddings · top-k 5 · cosine + HNSW
- Targets: ≥ 90% correct citations · median response ≤ 5 s
- `.gitignore` must include: `.env`, `storage/`, `samples/`, `~$*.xlsx`
- Chunk counts (T12): lecture notes = 289 (278 pages) · paper = 22 (15 pages) · scanned = 0 ("no text")
- Gemini free tier: 30,000 embedding tokens/minute → a 278-page PDF takes ~4 min to index.
