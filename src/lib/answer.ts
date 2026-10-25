import { generateAnswer } from "./ai";
import type { Citation } from "./db/schema";
import { notFoundAnswer } from "./prompts";
import { type RetrievedChunk, searchChunks } from "./search";

export type AnswerResult = {
  answer: string;
  citations: Citation[];
  // The retrieved passages, for the terminal and for evaluation.
  sources: RetrievedChunk[];
};

// Matches citation markers like [1], [1, 2], [2][3] or [1-3].
const markerPattern = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;

// The model is told to reply exactly `notFoundAnswer`, but models sometimes
// reword it slightly ("The answer is not found in the documents."), so we
// match the key phrase case-insensitively.
export function isNotFound(answer: string): boolean {
  return /not found in the documents/i.test(answer);
}

// The full RAG question flow: retrieve -> generate -> map citations.
export async function answerQuestion(
  userId: string,
  question: string,
  documentIds?: string[],
): Promise<AnswerResult> {
  const sources = await searchChunks(userId, question, { documentIds });

  // Each passage carries its source so the model sees where text came from.
  const passages = sources.map(
    (source) => `(${source.documentName}, page ${source.pageNumber})\n${source.content}`,
  );
  const raw = await generateAnswer(question, passages);
  return toAnswer(raw, sources);
}

// Turns the model's raw reply into { answer, citations }. Exported for tests.
export function toAnswer(raw: string, sources: RetrievedChunk[]): AnswerResult {
  if (isNotFound(raw)) {
    return { answer: notFoundAnswer, citations: [], sources };
  }

  return {
    // The [n] markers are replaced by the structured citation list.
    answer: raw.replace(new RegExp(`\\s*${markerPattern.source}`, "g"), "").trim(),
    citations: citationsFor(raw, sources),
    sources,
  };
}

// Expands "1, 2" -> [1, 2] and "1-3" -> [1, 2, 3].
function markerNumbers(inner: string): number[] {
  return inner.split(",").flatMap((part) => {
    const [from, to] = part.split(/[–-]/).map((n) => Number(n.trim()));
    if (to === undefined) return [from];
    return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  });
}

// Turns the [n] markers in the answer into { documentId, documentName, page },
// one entry per document + page. Markers outside 1..k are ignored, so the
// model cannot cite a passage it was never given. No markers -> no citations:
// we never attach pages the model did not say it used.
function citationsFor(answer: string, sources: RetrievedChunk[]): Citation[] {
  const used = [...answer.matchAll(markerPattern)]
    .flatMap((match) => markerNumbers(match[1]))
    .map((n) => sources[n - 1])
    .filter((source) => source !== undefined);

  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const source of used) {
    const key = `${source.documentId}:${source.pageNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({
      documentId: source.documentId,
      documentName: source.documentName,
      page: source.pageNumber,
    });
  }
  return citations;
}
