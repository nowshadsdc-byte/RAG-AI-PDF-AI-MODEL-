# TODO — RAG Chat-with-PDF

> 1 hour/day · Full plan: `docs/RAG_Project_Plan.xlsx` · Rules: `CLAUDE.md`
> End of every session: lint + typecheck → commit → update this file → mark task Done in the spreadsheet.

## Next
- **Week 2 starts: PDF extraction** — `src/lib/extract.ts` with `unpdf`, returning `[{ page, text }]`, plus a terminal test on a sample PDF.
- `GEMINI_API_KEY` set in `.env`; `embed()` verified live (768 dims) ✅.

## Last session — 24 Oct 2026 — Setup + DeepSeek ✅
- Done: answers switched from Gemini to **DeepSeek V4.1 Flash via InferX** (OpenAI-compatible, `src/lib/ai/deepseek.ts`); embeddings kept on Gemini (`src/lib/ai/gemini.ts`); grounded prompt moved to `src/lib/prompts.ts`; `npm run test:ai` verified live (grounded answer ✅, "not found" ✅).
- Review: lint ✅ · `tsc --noEmit` ✅ · `next build` ✅ · DB has 5 tables + `vector` extension ✅.
- Problems: InferX returns `429 all replicas at capacity` on back-to-back calls → added retry with backoff (2/4/6 s). Response time ~10–20 s (reasoning model) — watch against the ≤ 5 s target in W8.
- Not yet verified: GitHub push.

## This week — Week 1: Setup (25 – 31 Oct)
- [x] T01 Install dev tools (Node, Git, Docker, VS Code)
- [x] T02 Create Next.js project + push to GitHub
- [x] T03 Postgres + pgvector in Docker
- [x] T04 Set up Drizzle ORM (`.env` with `DATABASE_URL`)
- [x] T05 Define database schema (5 tables, `vector(768)`)
- [x] T06 LLM API test script — DeepSeek (InferX) instead of Gemini; `npm run test:ai` passes
- [x] T07 Buffer / review — lint, typecheck, build, DB checked

## Milestones
- [x] W1 Setup — app + DB running
- [ ] W2 Extraction & chunking — page-tagged chunks + embeddings
- [ ] W3 Indexing & retrieval — top-5 chunks with pages in terminal
- [ ] W4 LLM & UI shell — cited answer / "not found" in terminal
- [ ] W5 Web UI & chat — chat with a PDF in the browser
- [ ] W6 Auth & privacy — users isolated
- [ ] W7 History & providers — MVP feature-complete, Qwen adapter
- [ ] W8 Evaluation & deploy — numbers recorded, Docker Compose, demo-ready

## Blocked
- Nothing.

## Ideas / later (out of v1 scope — don't build yet)
- OCR for scanned PDFs
- Hybrid BM25 + vector search, re-ranking

## Quick notes
- Defaults: chunk 600 tokens / 80 overlap · 768-dim embeddings · top-k 5 · cosine + HNSW
- Targets: ≥ 90% correct citations · median response ≤ 5 s
- `.gitignore` must include: `.env`, `storage/`, `~$*.xlsx`
