import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import { getCurrentUserId } from "../src/lib/current-user";
import { ingestPdf } from "../src/lib/ingest";

// T15: index a PDF from the terminal (for the dev user, until W6 auth).
// Usage: npx tsx scripts/ingest.ts <file.pdf>
async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: npx tsx scripts/ingest.ts <file.pdf>");
  }

  const started = Date.now();
  const userId = await getCurrentUserId();
  const result = await ingestPdf(userId, path.basename(filePath), await readFile(filePath));

  console.log(
    `Indexed ${path.basename(filePath)} as ${result.documentId}: ` +
      `${result.pages} pages (${result.textPages} with text), ${result.chunks} chunks ` +
      `in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
  await db.$client.end(); // close the DB pool so the script can exit
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "An unknown error occurred.";
  console.error(`Ingestion failed: ${message}`);
  process.exitCode = 1;
  void db.$client.end();
});
