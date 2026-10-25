import { eq } from "drizzle-orm";
import { db } from "./db";
import { documents } from "./db/schema";
import { enqueueIndexing } from "./index-queue";
import { cleanupStaleUploads, resetInterruptedAssemblies } from "./uploads";

// Runs once when the server starts (see instrumentation.ts). Background
// work lives in memory, so after a restart we pick it up again:
// - documents still "processing" are queued for indexing again,
// - an assembly that was cut off can be retried by the client,
// - old unfinished uploads are cleaned up.
export async function resumeInterruptedWork() {
  try {
    await resetInterruptedAssemblies();
    const pending = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.status, "processing"));
    for (const { id } of pending) enqueueIndexing(id);
    if (pending.length > 0) console.info(`[startup] re-queued ${pending.length} document(s)`);
    await cleanupStaleUploads();
  } catch (error) {
    // Never block the server from starting (e.g. DB not up yet).
    console.error("[startup] could not resume background work:", error);
  }
}
