import { eq } from "drizzle-orm";
import { embed } from "./ai";
import { chunkPages } from "./chunk";
import { cleanPages } from "./clean";
import { db } from "./db";
import { documentChunks, documents } from "./db/schema";
import { extractPageText, isEmptyPage, NoTextError, openPdf, type PageText } from "./extract";
import { resolveStoragePath } from "./storage";

// Pages handled per step. Only this many pages of text, chunks and vectors
// are in memory at once, and progress is saved after every batch.
const pagesPerBatch = 20;

// A PDF where fewer than 10% of pages have text is treated as scanned: its
// few text pages are usually just a watermark or cover, and answers from
// them would be useless. (Only for PDFs of 10+ pages.)
const minTextPageRatio = 0.1;

// The message stored in documents.error and shown in the UI. Never the raw
// error: DB errors embed the query and its data (which once contained a NUL
// byte that made even this update fail and left the document stuck).
function userMessage(error: unknown): string {
  if (error instanceof NoTextError) {
    return "This PDF has (almost) no selectable text — it looks scanned. OCR is not supported.";
  }
  if (error instanceof Error && error.message.startsWith("Failed query")) {
    return "Saving the index failed. Try again.";
  }
  const text = error instanceof Error ? error.message : "Indexing failed.";
  return text.replace(/[\u0000-\u001F]/g, " ").slice(0, 300);
}

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
    let textPages = 0;
    for (let first = 1; first <= pageCount; first += pagesPerBatch) {
      const last = Math.min(first + pagesPerBatch - 1, pageCount);
      const batch: PageText[] = [];
      for (let page = first; page <= last; page++) {
        batch.push({ page, text: await extractPageText(pdf, page) });
      }

      const cleaned = cleanPages(batch);
      textPages += cleaned.filter((page) => !isEmptyPage(page)).length;
      const chunks = chunkPages(cleaned, undefined, undefined, chunkCount);
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

    const mostlyScanned = pageCount >= 10 && textPages / pageCount < minTextPageRatio;
    if (chunkCount === 0 || mostlyScanned) throw new NoTextError(document.name);

    await db.update(documents).set({ status: "ready" }).where(eq(documents.id, documentId));
    return { pages: pageCount, chunks: chunkCount };
  } catch (error) {
    // The document must never stay "processing" (the UI would wait forever),
    // so marking it failed is attempted even if the cleanup step fails.
    // If the document was deleted meanwhile, these update nothing — fine.
    try {
      await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
    } catch (cleanupError) {
      console.error(`[index] could not remove chunks of ${documentId}:`, cleanupError);
    }
    await db
      .update(documents)
      .set({ status: "failed", error: userMessage(error) })
      .where(eq(documents.id, documentId));
    throw error;
  } finally {
    await pdf?.loadingTask.destroy(); // free the parsed PDF
  }
}
