import assert from "node:assert/strict";
import { test } from "node:test";
import { toAnswer } from "../src/lib/answer";
import { notFoundAnswer } from "../src/lib/prompts";
import type { RetrievedChunk } from "../src/lib/search";

// Five fake retrieved passages: pages 1..5 of one document.
const sources: RetrievedChunk[] = [1, 2, 3, 4, 5].map((page) => ({
  documentId: "doc-1",
  documentName: "notes.pdf",
  pageNumber: page,
  content: `text of page ${page}`,
  similarity: 0.9,
}));

const pagesOf = (raw: string) => toAnswer(raw, sources).citations.map((c) => c.page);

test("single markers map to pages and are removed from the answer", () => {
  const result = toAnswer("OSHA was created in 1970 [2]. It sets standards [4].", sources);
  assert.equal(result.answer, "OSHA was created in 1970. It sets standards.");
  assert.deepEqual(
    result.citations.map((c) => c.page),
    [2, 4],
  );
});

test("lists, ranges and adjacent markers are all understood", () => {
  assert.deepEqual(pagesOf("A [1, 3]."), [1, 3]);
  assert.deepEqual(pagesOf("A [2-4]."), [2, 3, 4]);
  assert.deepEqual(pagesOf("A [5][1]."), [5, 1]);
});

test("the same page cited twice appears once", () => {
  assert.deepEqual(pagesOf("A [1]. B [1]."), [1]);
});

test("markers outside the retrieved passages are ignored", () => {
  assert.deepEqual(pagesOf("A [9]. B [0]. C [2]."), [2]);
});

test("no markers means no citations (never guess pages)", () => {
  assert.deepEqual(pagesOf("An answer without any marker."), []);
});

test("a reworded 'not found' reply is normalised and has no citations", () => {
  const result = toAnswer("The answer is Not Found in the documents [1].", sources);
  assert.equal(result.answer, notFoundAnswer);
  assert.deepEqual(result.citations, []);
});
