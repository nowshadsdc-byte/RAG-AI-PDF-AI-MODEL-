# TODO — RAG Chat-with-PDF

> 1 hour/day · Full plan: `docs/RAG_Project_Plan.xlsx` · Rules: `CLAUDE.md`
> End of every session: lint + typecheck → commit → update this file → mark task Done in the spreadsheet.

## Next
- **Finish T09/T12 with your own samples:** put a lecture-notes PDF, a research paper and a scanned PDF in `samples/`, run `npx tsx scripts/try-chunk.ts samples/<file>.pdf` on each, and fill in the chunk counts under Quick notes.
- Then T14: run the `rag-reviewer` agent and plan Week 3 (T15 ingestion script).

## Last session — 25 Oct 2026 — Week 2 code (T08–T13) ✅
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

- [ ] **T09 · Mon 2 Nov — Test extraction on 3 PDFs**
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

- [ ] **T12 · Thu 5 Nov — Test chunker**
  - Check: no empty chunks, overlap present, page numbers correct, no chunk over ~800 tokens
  - Log chunk count per sample PDF in Quick notes below
  - ✅ Done when: counts look sensible (≈ 1–2 chunks per page)

- [x] **T13 · Fri 6 Nov — Embedding function**
  - `lib/ai/embed.ts` using the Gemini embedding model, output dimensionality **768**
  - Batch requests (e.g. 50 per call), retry with a short wait on rate-limit (429)
  - Use separate task types for documents vs. questions if the API supports it
  - ✅ Done when: `embed(["hello"])` returns one vector of length 768

- [ ] **T14 · Sat 7 Nov — Buffer / review**
  - Finish anything unfinished; run the `rag-reviewer` agent on the week's code
  - Lint + typecheck, commit, plan Week 3
  - ✅ Done when: Week 2 complete & committed

## Milestones
- [x] W1 Setup — app + DB running
- [ ] **W2 Extraction & chunking — page-tagged chunks + embeddings** ← you are here
- [ ] W3 Indexing & retrieval — top-5 chunks with pages in terminal
- [ ] W4 LLM & UI shell — cited answer / "not found" in terminal
- [ ] W5 Web UI & chat — chat with a PDF in the browser
- [ ] W6 Auth & privacy — users isolated
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
- Chunk counts (T12): lecture notes = ___ · paper = ___ · scanned = 0
