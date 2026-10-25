import "dotenv/config";
import { db } from "../src/lib/db";
import { cleanupStaleUploads, staleUploadMs } from "../src/lib/uploads";

// Deletes unfinished uploads older than 24 h (or N hours) and their chunks.
// The app also does this automatically when a new upload starts.
// Usage: npx tsx scripts/cleanup-uploads.ts [hours]
async function main() {
  const hours = Number(process.argv[2]);
  const maxAge = Number.isFinite(hours) && hours >= 0 ? hours * 3600_000 : staleUploadMs;
  const { removed, orphans } = await cleanupStaleUploads(maxAge);
  console.log(`Removed ${removed} stale upload(s) and ${orphans} orphan folder(s).`);
  await db.$client.end();
}

main().catch((error: unknown) => {
  console.error(`Cleanup failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
  void db.$client.end();
});
