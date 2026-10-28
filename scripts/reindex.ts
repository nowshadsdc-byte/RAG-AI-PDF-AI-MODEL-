import "dotenv/config";
import { db } from "../src/lib/db";
import { indexStoredDocument } from "../src/lib/ingest";

// Terminal version of the "retry indexing" button: re-indexes a document
// whose file is already in storage (e.g. after a failed ingest).
// Usage: npx tsx scripts/reindex.ts <documentId>
async function main() {
  const documentId = process.argv[2];
  if (!documentId) {
    throw new Error("Usage: npx tsx scripts/reindex.ts <documentId>");
  }

  const started = Date.now();
  const result = await indexStoredDocument(documentId, (done, total) => {
    process.stdout.write(`\rIndexing page ${done} of ${total}…`);
  });
  console.log(
    `\nRe-indexed ${documentId}: ${result.pages} pages, ${result.chunks} chunks in ` +
      `${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
  await db.$client.end(); // close the DB pool so the script can exit
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "An unknown error occurred.";
  console.error(`\nRe-index failed: ${message}`);
  process.exitCode = 1;
  void db.$client.end();
});
