import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { db } from "../src/lib/db";
import { getCurrentUserId } from "../src/lib/current-user";
import { documents } from "../src/lib/db/schema";
import { indexStoredDocument } from "../src/lib/ingest";
import { documentRelPath, writeDocumentFile } from "../src/lib/storage";

// T15: index a PDF from the terminal (for the dev user, until W6 auth).
// Copies the file into storage (streamed, any size), creates the document
// row, then indexes it here directly — no web server needed.
// Usage: npx tsx scripts/ingest.ts <file.pdf>
async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: npx tsx scripts/ingest.ts <file.pdf>");
  }

  const started = Date.now();
  const userId = await getCurrentUserId();
  const documentId = randomUUID();
  const relPath = documentRelPath(documentId);
  const { size, sha256 } = await writeDocumentFile(relPath, [() => createReadStream(filePath)]);
  await db.insert(documents).values({
    id: documentId,
    userId,
    name: path.basename(filePath),
    storagePath: relPath,
    status: "processing",
    sizeBytes: size,
    sha256,
  });

  const result = await indexStoredDocument(documentId, (done, total) => {
    process.stdout.write(`\rIndexing page ${done} of ${total}…`);
  });
  console.log(
    `\nIndexed ${path.basename(filePath)} as ${documentId}: ` +
      `${result.pages} pages, ${result.chunks} chunks ` +
      `in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
  await db.$client.end(); // close the DB pool so the script can exit
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "An unknown error occurred.";
  console.error(`\nIngestion failed: ${message}`);
  process.exitCode = 1;
  void db.$client.end();
});
