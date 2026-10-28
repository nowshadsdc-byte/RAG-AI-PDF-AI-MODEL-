# TODO — Week 6: Auth & Privacy — users isolated (29 Nov – 5 Dec)

> 1 hour/day · Plan: `docs/RAG_Project_Plan.xlsx` (T36–T42) · Rules: `CLAUDE.md` (rule 5 = privacy)
> End of every session: `npm run lint && npx tsc --noEmit` → commit → tick here → mark Done in the spreadsheet.

**Goal:** real accounts replace the temporary `dev@localhost` user. A logged-out visitor sees only login/register; user A can never see user B's documents, chunks, answers, citations or files.

**Starting point (already done in W3–W5):** every API route and script gets its user from `getCurrentUserId()` in `src/lib/current-user.ts`, and every query already filters by `user_id`. Most of W6 is: make that function read the session, then prove isolation with tests.

> ⚠️ Next.js 16: middleware is now **`proxy.ts`** (project root). Read `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` and `node_modules/next/dist/docs/01-app/02-guides/authentication.md` before writing code.

---

## Earlier weeks — all closed 28 Oct 2026 (details in `TODO_1.md`)
- [x] **T09** — 3 sample PDFs; scanned → "no text"
- [x] **T12** — paper 22 chunks, lecture notes 289, scanned 0
- [x] **T14** — `rag-reviewer` on Week 2 code; 4 fixes applied
- [x] **T18** — `scripts/eval.ts`: hits 10/10, citations 9/10, "not found" 2/2, median 1.9 s → `docs/eval/results.md`
- [x] **T19** — no tuning needed (no retrieval misses)
- [x] Upload progress UI in a browser: offline mid-upload → Retry resumes, file hash identical
- [ ] Copy `docs/eval/results.md` rows into the spreadsheet Eval Log; mark T09/T12/T14/T18/T19 Done

---

## Week 6 tasks

- [x] **T36 · Sun 29 Nov — Authentication (register + login)** — done 28 Oct 2026
  - **Built:** `src/lib/users.ts` (register / verify / default user, bcryptjs cost 12), `src/lib/auth.ts` (Auth.js v5 credentials, JWT), `src/lib/auth-actions.ts` (login / register / logout server actions), `app/login`, `app/register`, `src/components/auth-form.tsx`, `src/components/user-menu.tsx` (email + Log out in the chat header, inside `<Suspense>` for Cache Components).
  - **Default user:** `npm run db:seed` creates `DEFAULT_USER_EMAIL` / `DEFAULT_USER_PASSWORD` from `.env` (nowshad.sdc@gmail.com). The old `dev@localhost` row was converted into it, so the 3 indexed PDFs kept their owner.
  - **Tests:** `tests/auth.test.ts` 9 tests (hash stored not password, normalised email, duplicate email, validation, wrong/unknown login, `"!"` hash, default user idempotent / password reset / dev-user conversion / bad .env). `npm test` 30/30, lint, `tsc`, `next build` ✅.
  - **Browser check (headless Chrome):** logged-out → `/login`; wrong password → "Wrong email or password."; default user login → sees 3 PDFs, cited answer p.3; logout → `/login` + API 401; register mismatch error; new user → 0 documents and 404 on the default user's PDF; duplicate email refused. 12/12 ✅
  - Note: `bcryptjs` (pure-JS bcrypt, same hash format `$2b$12$…`) instead of native `bcrypt` — nothing to compile on Windows or in Docker.
  - `npm i next-auth@beta bcryptjs` (+ `@types/bcryptjs` if needed). Add `AUTH_SECRET` to `.env` **and** `.env.example` (`npx auth secret` generates one).
  - `src/lib/auth.ts`: Auth.js with the **Credentials** provider, JWT session; `authorize()` looks up `users.email` and checks `bcrypt.compare(password, passwordHash)`. Put the user id in the token/session (`callbacks.jwt` / `callbacks.session`).
  - `app/api/auth/[...nextauth]/route.ts` exports the handlers.
  - Register: a server action or `POST /api/register`. Validate email + password (≥ 8 chars), lowercase the email, `bcrypt.hash(pw, 12)`, insert. A duplicate email returns a friendly error (unique index `users_email_unique` already exists).
  - Pages: `app/login/page.tsx`, `app/register/page.tsx` (shadcn `Input`, `Button`, `Card`). Add a logout button in the chat header.
  - Never log or return passwords or hashes.
  - ✅ Done when: you can register, log out and log back in.

- [ ] **T37 · Mon 30 Nov — Protect routes** — _core done early with T36:_ `getCurrentUserId()` reads the session (throws `UnauthorizedError`), `userIdOr401()` / `errorResponse` → 401, `proxy.ts` redirects to `/login`, scripts use `getScriptUserId()` (default user from `.env`), index queue checked (uses document rows). **Left:** add these cases to the T40 privacy test; then tick.
  - Replace the body of `getCurrentUserId()` with: read `auth()` session → return `session.user.id`; if there is no session, throw an `UnauthorizedError`. Remove the dev-user code.
  - API routes: catch `UnauthorizedError` → `401` (one small helper so the 10 routes don't each repeat it).
  - `proxy.ts`: redirect logged-out visitors from `/` to `/login`; leave `/login`, `/register`, `/api/auth/*` and static files public.
  - Scripts (`scripts/ingest.ts`, `scripts/ask.ts`) have no session: give them a `--user <email>` flag (or `RAG_USER_EMAIL` in `.env`) and look up that user's id instead.
  - Background indexing queue (`src/lib/index-queue.ts`, `instrumentation.ts`) runs without a request: check it uses each document's own `user_id`, not `getCurrentUserId()`.
  - ✅ Done when: a logged-out browser lands on `/login`, and `curl http://localhost:3000/api/documents` returns 401.

- [ ] **T38 · Tue 1 Dec — Scope data by user (audit)**
  - Grep every `db.select / update / delete` and raw `sql` in `src/lib/**` and `app/api/**`; each must have `user_id = <session user>`, or go through a document the user owns.
  - Check in particular: `src/lib/search.ts` (filter is inside the vector query, **before** `LIMIT 5`), the chat route's document filter (ids from the client must be re-checked against the user), uploads + upload chunks, reindex.
  - Conversations/messages tables exist but aren't used until W7 — note that their queries must be scoped too.
  - ✅ Done when: search as user B never returns user A's chunks (even when B's question matches A's PDF exactly).

- [ ] **T39 · Wed 2 Dec — Secure file serving**
  - `app/api/documents/[id]/file/route.ts`: ownership check before streaming (already returns **404** for other users — keep 404 rather than the plan's 403, so other users' ids can't be probed; write this choice in the report).
  - Check that `storage/documents/` is not under `public/` and that the path comes from the DB row, never from the request (no `../` traversal).
  - Logged out → 401, not the file.
  - ✅ Done when: user B opening user A's citation link gets 404 and logged-out gets 401.

- [ ] **T40 · Thu 3 Dec — Privacy test (users A & B)**
  - Add `tests/privacy.test.ts` (runs with `npm test`): create users A and B, A uploads a PDF, then as B try: list documents, `GET` A's file, `DELETE` A's doc, reindex A's doc, chat with A's document id in the filter, upload-status / chunk / complete on A's upload id.
  - Every attempt must fail (401/404) **and** A's data must be unchanged afterwards.
  - Also try it by hand in two browsers (one normal, one private window).
  - ✅ Done when: all cross-access attempts fail and the test is green.

- [ ] **T41 · Fri 4 Dec — Delete document (verify)**
  - Already built in W5 (`DELETE /api/documents/:id`). Now verify it as a real user: file gone from `storage/documents/`, `SELECT count(*) FROM chunks WHERE document_id = …` is 0, the document's citations no longer open.
  - Check deleting during indexing (status `indexing`) doesn't leave orphan chunks or a stuck queue job.
  - Deleting a **user** cascades to their documents/chunks in the DB — decide whether their files on disk must also be removed (note it, don't build an account-delete UI).
  - ✅ Done when: no orphan chunks or files remain.

- [ ] **T42 · Sat 5 Dec — Buffer / review**
  - Run the `rag-reviewer` agent on the Week 6 changes (focus: privacy).
  - `npm run lint && npx tsc --noEmit && npm test && npm run build`.
  - Update `.env.example`, `TODO_1.md` milestones (tick W6), spreadsheet T36–T42.
  - ✅ Done when: Week 6 complete & committed.

---

## Notes for the viva
- Why bcrypt: slow, salted hash — a leaked DB doesn't expose passwords.
- Why JWT sessions: no sessions table needed for the credentials provider; the token is signed with `AUTH_SECRET`.
- Why 404 instead of 403 for other users' documents: doesn't reveal that the id exists.
- Privacy rule: only retrieved passages (top-5 chunks of **your own** documents) are sent to the LLM — never whole PDFs.
