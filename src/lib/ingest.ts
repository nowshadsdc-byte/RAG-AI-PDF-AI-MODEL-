import { randomUUID } from "node:crypto";
import { embed } from "./ai";
import { chunkPages } from "./chunk";
import { cleanPages } from "./clean";
import { db } from "./db";
import { documentChunks, documents } from "./db/schema";
import { extractPages, isEmptyPage, NoTextError } from "./extract";
import { deleteDocumentFile, saveDocumentFile, storagePathFor } from "./storage";

export type IngestResult = {
  documentId: string;
  pages: number;
  textPages: number;
  chunks: number;
};

// The whole indexing pipeline for one PDF:
// extract -> clean -> chunk -> embed -> save file -> save rows.
// The slow, failure-prone steps (extraction, embedding) run first, so a bad
// PDF or an API error leaves nothing behind on disk or in the DB.
export async function ingestPdf(
  userId: string,
  name: string,
  data: Uint8Array,
): Promise<IngestResult> {
  const pages = cleanPages(await extractPages(data, name));
  const chunks = chunkPages(pages);
  // Cleaning can leave nothing (e.g. only repeated headers had text).
  if (chunks.length === 0) throw new NoTextError(name);
  const vectors = await embed(
    chunks.map((chunk) => chunk.content),
    "document",
  );

  const documentId = randomUUID();
  const storagePath = storagePathFor(documentId);
  await saveDocumentFile(documentId, data);

  try {
    // One transaction: either the document and all its chunks are saved, or none.
    await db.transaction(async (tx) => {
      await tx.insert(documents).values({ id: documentId, userId, name, storagePath });
      await tx.insert(documentChunks).values(
        chunks.map((chunk, i) => ({
          documentId,
          chunkIndex: chunk.chunkIndex,
          pageNumber: chunk.pageNumber,
          content: chunk.content,
          embedding: vectors[i],
        })),
      );
    });
  } catch (error) {
    await deleteDocumentFile(storagePath);
    throw error;
  }

  return {
    documentId,
    pages: pages.length,
    textPages: pages.filter((page) => !isEmptyPage(page)).length,
    chunks: chunks.length,
  };
}
