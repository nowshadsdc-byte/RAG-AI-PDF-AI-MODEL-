import { cleanPages } from "../src/lib/clean";
import { extractPages, isEmptyPage, NoTextError } from "../src/lib/extract";

// T08–T10: prints page count and the first 200 characters of each page.
// Usage: npx tsx scripts/try-extract.ts <file.pdf> [--raw]
async function main() {
  const [filePath, flag] = process.argv.slice(2);
  if (!filePath) {
    throw new Error("Usage: npx tsx scripts/try-extract.ts <file.pdf> [--raw]");
  }

  const raw = await extractPages(filePath);
  const pages = flag === "--raw" ? raw : cleanPages(raw);
  const emptyCount = pages.filter(isEmptyPage).length;

  console.log(`${filePath}: ${pages.length} pages (${emptyCount} empty)\n`);
  for (const page of pages) {
    const label = isEmptyPage(page) ? " [empty]" : "";
    console.log(`--- page ${page.page}${label} ---`);
    console.log(page.text.slice(0, 200));
  }
}

main().catch((error: unknown) => {
  if (error instanceof NoTextError) {
    console.error(`no text: ${error.message}`);
  } else {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred.";
    console.error(`Extraction failed: ${message}`);
  }
  process.exitCode = 1;
});
