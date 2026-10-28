import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { answerQuestion, isNotFound } from "../src/lib/answer";
import { db } from "../src/lib/db";
import { getScriptUserId } from "../src/lib/users";

// T18 / W8: retrieval + citation test. For each question in the JSON file it
// asks the full pipeline (search → answer) and checks:
//   - hit:      the expected page is among the top-5 retrieved chunks
//   - citation: the answer cites the expected document + page
// Questions with "expectedPage": null must come back as "not found".
// Faithfulness is judged by reading the printed answers.
// Usage: npx tsx scripts/eval.ts [questions.json] [results.md]
type Question = { pdf: string | null; question: string; expectedPage: number | null };

async function main() {
  const [questionsPath = "docs/eval/questions.json", resultsPath = "docs/eval/results.md"] =
    process.argv.slice(2);
  const questions = JSON.parse(readFileSync(questionsPath, "utf8")) as Question[];
  const userId = await getScriptUserId();

  const rows: string[] = [];
  const times: number[] = [];
  let hits = 0;
  let cited = 0;
  let answerable = 0;
  let notFoundOk = 0;

  for (const [i, q] of questions.entries()) {
    const started = Date.now();
    const { answer, citations, sources } = await answerQuestion(userId, q.question);
    const seconds = (Date.now() - started) / 1000;
    times.push(seconds);

    const retrieved = sources.map((s) => `${s.documentName === q.pdf ? "" : "*"}${s.pageNumber}`);
    let hit = "–";
    let citation = "–";
    if (q.expectedPage === null) {
      const ok = isNotFound(answer) && citations.length === 0;
      if (ok) notFoundOk++;
      citation = ok ? "not found ✅" : "answered ❌";
    } else {
      answerable++;
      const isHit = sources.some((s) => s.documentName === q.pdf && s.pageNumber === q.expectedPage);
      const isCited = citations.some((c) => c.documentName === q.pdf && c.page === q.expectedPage);
      if (isHit) hits++;
      if (isCited) cited++;
      hit = isHit ? "Yes" : "No";
      citation = isCited ? "Yes" : "No";
    }

    const cites = citations.map((c) => `${c.documentName} p.${c.page}`).join("; ") || "none";
    console.log(`\n[${i + 1}] ${q.question}`);
    console.log(`    expected ${q.pdf ?? "-"} p.${q.expectedPage ?? "-"} · top-5 ${retrieved.join(", ")} · hit ${hit} · cited ${citation} · ${seconds.toFixed(1)} s`);
    console.log(`    answer: ${answer.replace(/\s+/g, " ")}`);
    console.log(`    citations: ${cites}`);
    rows.push(
      `| ${i + 1} | ${q.pdf ?? "-"} | ${q.question} | ${q.expectedPage ?? "-"} | ${retrieved.join(", ")} | ${hit} | ${citation} | ${seconds.toFixed(1)} | ${answer.replace(/\s+/g, " ").replace(/\|/g, "\\|")} |`,
    );
  }

  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  const negatives = questions.length - answerable;
  const summary = [
    `Retrieval hit rate: ${hits}/${answerable}`,
    `Citation correctness: ${cited}/${answerable} (target ≥ 90%)`,
    `"Not found" when evidence is missing: ${notFoundOk}/${negatives}`,
    `Median response time: ${median.toFixed(1)} s (target ≤ 5 s)`,
  ];
  console.log(`\n${summary.join("\n")}`);

  writeFileSync(
    resultsPath,
    [
      `# Eval results — ${new Date().toISOString().slice(0, 10)}`,
      "",
      "`*` before a page = chunk from a different PDF than expected.",
      "",
      "| # | PDF | Question | Expected page | Top-5 pages | Hit? | Cited correct page? | Time (s) | Answer |",
      "|---|---|---|---|---|---|---|---|---|",
      ...rows,
      "",
      ...summary.map((line) => `- ${line}`),
      "",
    ].join("\n"),
  );
  console.log(`\nSaved ${resultsPath}`);
  await db.$client.end(); // close the DB pool so the script can exit
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "An unknown error occurred.";
  console.error(`Eval failed: ${message}`);
  process.exitCode = 1;
  void db.$client.end();
});
