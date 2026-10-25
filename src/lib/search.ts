import { and, cosineDistance, eq, inArray } from "drizzle-orm";
import { embed } from "./ai";
import { db } from "./db";
import { documentChunks, documents } from "./db/schema";

export const topK = 5;

export type RetrievedChunk = {
  documentId: string;
  documentName: string;
  pageNumber: number;
  content: string;
  // 1 = same direction as the question, 0 = unrelated.
  similarity: number;
};

// Embeds the question and returns the k closest chunks by cosine distance.
// pgvector's `<=>` operator (cosineDistance) uses the HNSW index.
// Only the given user's documents are searched (core rule 5).
export async function searchChunks(
  userId: string,
  question: string,
  options: { k?: number; documentIds?: string[] } = {},
): Promise<RetrievedChunk[]> {
  const [queryVector] = await embed([question], "query");
  const distance = cosineDistance(documentChunks.embedding, queryVector);

  const rows = await db
    .select({
      documentId: documents.id,
      documentName: documents.name,
      pageNumber: documentChunks.pageNumber,
      content: documentChunks.content,
      distance,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(
      and(
        eq(documents.userId, userId),
        // No filter given (or an empty list) = search all of the user's documents.
        options.documentIds?.length
          ? inArray(documents.id, options.documentIds)
          : undefined,
      ),
    )
    .orderBy(distance)
    .limit(options.k ?? topK);

  return rows.map(({ distance, ...row }) => ({
    ...row,
    similarity: 1 - Number(distance),
  }));
}
