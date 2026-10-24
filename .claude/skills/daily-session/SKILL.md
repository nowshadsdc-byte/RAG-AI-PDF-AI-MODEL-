---
name: daily-session
description: Run one focused 1-hour build session for the RAG Chat-with-PDF project. Use when the user says "start today's session", "what's today's task", "let's work", or "/daily-session".
---

# Daily 1-hour session

The developer has **one hour per day**. Your job is to get exactly one planned task done, working and committed.

## 1. Find today's task (≈ 3 min)

1. Read `TODO.md` — the "Next" line from last session wins.
2. Otherwise read `docs/RAG_Project_Plan.xlsx` → `Tasks` sheet: today's date row, or the first row whose Status is not `Done`.
   ```bash
   python -c "import pandas as pd; df=pd.read_excel('docs/RAG_Project_Plan.xlsx','Tasks'); print(df[df.Status!='Done'].head(1)[['ID','Task','Steps','Done when']].to_string())"
   ```
3. Tell the user in 2–3 lines: task ID, what you'll build, and the "Done when" check.
4. If it's a **Buffer** day, list unfinished/blocked tasks and offer to finish one, or clean up and refactor.

## 2. Plan (≈ 5 min)

- List the files you'll create or change (max ~3).
- If the task can't fit in one hour, split it: do the smallest runnable part now and write the rest to `TODO.md`.
- Follow every rule in `CLAUDE.md` (grounding, page numbers, `lib/ai` adapter, user scoping).

## 3. Build (≈ 35 min)

- Write the simplest code that meets "Done when". Explain any non-obvious line in a short comment.
- Prefer terminal scripts (`scripts/*.ts`, run with `npx tsx`) until the Week 4 UI tasks.
- Run it. Show the user the real output that proves "Done when".

## 4. Check (≈ 10 min)

```bash
npm run lint && npx tsc --noEmit
```
- Fix errors. For changes touching auth, file access, search or prompts, run the `rag-reviewer` agent.
- If the task was a retrieval/eval task, add rows to the `Eval Log` sheet.

## 5. Close (≈ 5 min)

1. Commit: `git add -A && git commit -m "<type>: <what> (T<id>)"`.
2. Update `TODO.md`:
   ```md
   ## Last session — <date> — T<id> <task> ✅ / ⏸
   - Done: ...
   - Problems: ...
   ## Next
   - T<id+1>: <task> — first step: <concrete step>
   ```
3. Remind the user to set the task to `Done` and log Actual hrs in the plan spreadsheet.
4. End with a two-line summary: what works now, and what starts tomorrow.

## Rules

- One task per session. Don't start the next task unless the current one is done and time is left.
- Never add out-of-scope features (OCR, re-ranking, agents, extra services).
- If blocked > 10 min (install issue, API quota), stop, record it as `Blocked` in `TODO.md` with the error, and suggest a workaround.
