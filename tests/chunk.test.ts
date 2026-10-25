import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkPages, estimateTokens } from "../src/lib/chunk";

// ~1000 words per page -> about 3 chunks per page at 600 tokens / 80 overlap.
const words = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(" ");
const pages = [
  { page: 1, text: words(1000, "a") },
  { page: 2, text: "" }, // empty page -> no chunks
  { page: 3, text: words(1000, "c") },
];

test("every chunk keeps a real page number and stays under ~800 tokens", () => {
  const chunks = chunkPages(pages);
  assert.ok(chunks.length > 0);
  for (const chunk of chunks) {
    assert.ok([1, 3].includes(chunk.pageNumber));
    assert.ok(chunk.content.trim().length > 0);
    assert.ok(estimateTokens(chunk.content) <= 800);
  }
});

test("startIndex continues chunk numbering across page batches", () => {
  const first = chunkPages(pages.slice(0, 2));
  const second = chunkPages(pages.slice(2), undefined, undefined, first.length);
  const indexes = [...first, ...second].map((c) => c.chunkIndex);
  assert.deepEqual(
    indexes,
    indexes.map((_, i) => i),
  );
  // Same result as chunking everything at once.
  assert.deepEqual([...first, ...second], chunkPages(pages));
});

test("neighbouring chunks of one page overlap", () => {
  const [a, b] = chunkPages([pages[0]]);
  const opening = b.content.split(" ").slice(0, 5).join(" ");
  assert.ok(a.content.includes(opening));
});

test("cleaning removes NUL and control characters (PostgreSQL rejects NUL)", async () => {
  const { cleanText } = await import("../src/lib/clean");
  assert.equal(cleanText("কর\u0000ন  এখানে\u0007\n বই"), "করন এখানে বই");
});
