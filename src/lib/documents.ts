import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { documents } from "./db/schema";
import { deleteDocumentFile } from "./storage";

// Every function takes the user id and filters by it (core rule 5), so one
// user can never list, read or delete another user's document.

export async function listDocuments(userId: string) {
  return db
    .select({
      id: documents.id,
      name: documents.name,
      createdAt: documents.createdAt,
      status: documents.status,
      sizeBytes: documents.sizeBytes,
      pageCount: documents.pageCount,
      indexedPages: documents.indexedPages,
      error: documents.error,
    })
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt));
}

// Ids come from the URL; anything that is not a UUID cannot exist (and would
// make Postgres throw), so it is treated as "not found".
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function getDocument(userId: string, documentId: string) {
  if (!isUuid(documentId)) return undefined;
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
  return row;
}

// Puts a failed document back to "processing" so it can be queued again.
// Returns false if not found, not owned, or not in the "failed" state.
export async function markForReindex(userId: string, documentId: string) {
  if (!isUuid(documentId)) return false;
  const updated = await db
    .update(documents)
    .set({ status: "processing", indexedPages: 0, error: null })
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.userId, userId),
        eq(documents.status, "failed"),
      ),
    )
    .returning({ id: documents.id });
  return updated.length > 0;
}

// Deleting the row removes its chunks too (ON DELETE CASCADE, core rule 6);
// the PDF file is removed afterwards. Returns false if not found / not owned.
export async function deleteDocument(userId: string, documentId: string) {
  if (!isUuid(documentId)) return false;
  const [deleted] = await db
    .delete(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
    .returning({ storagePath: documents.storagePath });
  if (!deleted) return false;

  await deleteDocumentFile(deleted.storagePath);
  return true;
}
