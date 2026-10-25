import type { PageText } from "./extract";

export type Chunk = { pageNumber: number; chunkIndex: number; content: string };

// Defaults from CLAUDE.md — tune only with Eval Log evidence.
export const chunkTokens = 600;
export const overlapTokens = 80;

// Rough estimate: English text averages ~1.33 tokens per word. Good enough
// for sizing chunks; we do not need an exact tokenizer here.
const tokensPerWord = 1.33;

export function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * tokensPerWord);
}

// Splits text into chunks per page, so every chunk has exactly one page
// number (core rule 2). Consecutive chunks of the same page share
// `overlap` tokens so a sentence cut at a boundary still appears whole once.
// chunkIndex counts across the whole document (unique per document in the DB).
export function chunkPages(
  pages: PageText[],
  size = chunkTokens,
  overlap = overlapTokens,
): Chunk[] {
  const wordsPerChunk = Math.floor(size / tokensPerWord);
  const overlapWords = Math.floor(overlap / tokensPerWord);
  const step = wordsPerChunk - overlapWords;

  const chunks: Chunk[] = [];
  for (const page of pages) {
    const words = page.text.split(/\s+/).filter(Boolean);

    for (let start = 0; start < words.length; start += step) {
      chunks.push({
        pageNumber: page.page,
        chunkIndex: chunks.length,
        content: words.slice(start, start + wordsPerChunk).join(" "),
      });
      // Stop once this chunk reached the end of the page, so the last chunk
      // is not followed by a tiny chunk made only of overlap words.
      if (start + wordsPerChunk >= words.length) break;
    }
  }

  return chunks;
}
