import "dotenv/config";
import { answerQuestion } from "../src/lib/answer";
import { db } from "../src/lib/db";
import { getCurrentUserId } from "../src/lib/current-user";
import { searchChunks } from "../src/lib/search";

// T17 + W4: ask a question from the terminal.
// Usage: npx tsx scripts/ask.ts "<question>"            -> cited answer
//        npx tsx scripts/ask.ts "<question>" --search   -> top-5 chunks only
async function main() {
  const [question, flag] = process.argv.slice(2);
  if (!question) {
    throw new Error('Usage: npx tsx scripts/ask.ts "<question>" [--search]');
  }

  const userId = await getCurrentUserId();
  const started = Date.now();

  if (flag === "--search") {
    const chunks = await searchChunks(userId, question);
    for (const [i, chunk] of chunks.entries()) {
      console.log(
        `[${i + 1}] ${chunk.documentName} p.${chunk.pageNumber} ` +
          `(similarity ${chunk.similarity.toFixed(3)}): ${chunk.content.slice(0, 120)}…`,
      );
    }
  } else {
    const { answer, citations, sources } = await answerQuestion(userId, question);
    console.log(`Answer: ${answer}\n`);
    console.log("Citations:");
    for (const citation of citations) {
      console.log(`  - ${citation.documentName}, page ${citation.page}`);
    }
    if (citations.length === 0) console.log("  (none)");
    console.log(
      `\nRetrieved pages: ${sources.map((s) => s.pageNumber).join(", ") || "none"}`,
    );
  }

  console.log(`Time: ${((Date.now() - started) / 1000).toFixed(1)} s`);
  await db.$client.end(); // close the DB pool so the script can exit
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "An unknown error occurred.";
  console.error(`Ask failed: ${message}`);
  process.exitCode = 1;
  void db.$client.end();
});
