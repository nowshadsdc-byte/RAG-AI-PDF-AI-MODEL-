import { chunkPages, estimateTokens } from "../src/lib/chunk";
import { cleanPages } from "../src/lib/clean";
import { extractPages, isEmptyPage } from "../src/lib/extract";

// T11–T12: extract -> clean -> chunk one PDF, print the chunks and run the
// checks from TODO (no empty chunks, overlap present, no chunk over ~800 tokens).
// Usage: npx tsx scripts/try-chunk.ts <file.pdf>
async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: npx tsx scripts/try-chunk.ts <file.pdf>");
  }

  const pages = cleanPages(await extractPages(filePath));
  const chunks = chunkPages(pages);

  for (const chunk of chunks) {
    console.log(
      `#${chunk.chunkIndex} page ${chunk.pageNumber} ` +
        `(~${estimateTokens(chunk.content)} tokens): ${chunk.content.slice(0, 80)}…`,
    );
  }

  const problems: string[] = [];
  const pageNumbers = new Set(pages.map((page) => page.page));
  for (const [i, chunk] of chunks.entries()) {
    if (!chunk.content.trim()) problems.push(`#${i} is empty`);
    if (estimateTokens(chunk.content) > 800) problems.push(`#${i} is over 800 tokens`);
    if (!pageNumbers.has(chunk.pageNumber)) problems.push(`#${i} has bad page number`);

    // Same-page neighbours must share text: the start of this chunk should
    // appear at the end of the previous one.
    const previous = chunks[i - 1];
    if (previous?.pageNumber === chunk.pageNumber) {
      const opening = chunk.content.split(" ").slice(0, 5).join(" ");
      if (!previous.content.includes(opening)) problems.push(`#${i} has no overlap`);
    }
  }

  const textPages = pages.filter((page) => !isEmptyPage(page)).length;
  console.log(
    `\n${chunks.length} chunks from ${textPages} pages with text ` +
      `(${(chunks.length / Math.max(textPages, 1)).toFixed(2)} per page)`,
  );
  console.log(problems.length ? `Problems:\n${problems.join("\n")}` : "All checks passed ✅");
  if (problems.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "An unknown error occurred.";
  console.error(`Chunking failed: ${message}`);
  process.exitCode = 1;
});
