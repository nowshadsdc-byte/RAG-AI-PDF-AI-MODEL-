import { eq } from "drizzle-orm";
import { embed } from "./ai";
import { chunkPages } from "./chunk";
import { cleanPages } from "./clean";
import { db } from "./db";
import { documentChunks, documents } from "./db/schema";
import { extractPageText, NoTextError, openPdf, type PageText } from "./extract";
import { resolveStoragePath } from "./storage";

// Pages handled per step. Only this many pages of text, chunks and vectors
// are in memory at once, and progress is saved after every batch.
const pagesPerBatch = 20;

export type IndexResult = { pages: number; chunks: number };

// Indexes a PDF that is already stored on disk with a `documents` row:
// for each batch of pages: extract -> clean -> chunk -> embed -> insert,
// then update documents.indexed_pages so the UI can show real progress.
// Ends with status "ready", or "failed" with a readable `error`.
// Re-running it (retry) first removes any chunks from an earlier attempt.
export async function indexStoredDocument(
  documentId: string,
  onProgress?: (indexedPages: number, pageCount: number) => void,
): Promise<IndexResult> {
  const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!document) throw new Error(`Document ${documentId} not found.`);

  await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
  await db
    .update(documents)
    .set({ status: "processing", indexedPages: 0, error: null })
    .where(eq(documents.id, documentId));

  let pdf;
  try {
    pdf = await openPdf(resolveStoragePath(document.storagePath));
    const pageCount = pdf.numPages;
    await db.update(documents).set({ pageCount }).where(eq(documents.id, documentId));

    let chunkCount = 0;
    for (let first = 1; first <= pageCount; first += pagesPerBatch) {
      const last = Math.min(first + pagesPerBatch - 1, pageCount);
      const batch: PageText[] = [];
      for (let page = first; page <= last; page++) {
        batch.push({ page, text: await extractPageText(pdf, page) });
      }

      const chunks = chunkPages(cleanPages(batch), undefined, undefined, chunkCount);
      if (chunks.length > 0) {
        const vectors = await embed(
          chunks.map((chunk) => chunk.content),
          "document",
        );
        await db.insert(documentChunks).values(
          chunks.map((chunk, i) => ({
            documentId,
            chunkIndex: chunk.chunkIndex,
            pageNumber: chunk.pageNumber,
            content: chunk.content,
            embedding: vectors[i],
          })),
        );
        chunkCount += chunks.length;
      }

      await db
        .update(documents)
        .set({ indexedPages: last })
        .where(eq(documents.id, documentId));
      onProgress?.(last, pageCount);
    }

    if (chunkCount === 0) throw new NoTextError(document.name);

    await db.update(documents).set({ status: "ready" }).where(eq(documents.id, documentId));
    return { pages: pageCount, chunks: chunkCount };
  } catch (error) {
    const message =
      error instanceof NoTextError
        ? "This PDF has no selectable text (scanned PDFs are not supported)."
        : error instanceof Error
          ? error.message
          : "Indexing failed.";
    // If the document was deleted meanwhile, this updates nothing — fine.
    await db
      .update(documents)
      .set({ status: "failed", error: message })
      .where(eq(documents.id, documentId));
    throw error;
  } finally {
    await pdf?.loadingTask.destroy(); // free the parsed PDF
  }
}
