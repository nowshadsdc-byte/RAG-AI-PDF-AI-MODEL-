import { readFile } from "node:fs/promises";
import { getDocumentProxy } from "unpdf";

export type PageText = { page: number; text: string };
export type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

// A page with fewer characters than this is treated as empty
// (blank page, image-only page, or a scanned page without a text layer).
export const minPageChars = 20;

// Thrown when no page has real text — usually a scanned PDF (OCR is out of scope).
export class NoTextError extends Error {
  constructor(label: string) {
    super(`No extractable text in "${label}" (scanned PDF? OCR is not supported).`);
    this.name = "NoTextError";
  }
}

export function isEmptyPage(page: PageText): boolean {
  return page.text.trim().length < minPageChars;
}

// Opens a PDF with pdf.js. pdf.js needs the whole file in memory to parse
// it, so this is the one place a full PDF is loaded (indexing runs one
// document at a time for that reason — see index-queue.ts).
export async function openPdf(source: string | Uint8Array): Promise<PdfDocument> {
  // pdf.js takes ownership of the bytes it is given, so always pass a copy.
  // `new Uint8Array(x)` copies, and also turns a Node Buffer into a plain
  // Uint8Array, which unpdf requires.
  const bytes = typeof source === "string" ? await readFile(source) : source;
  return getDocumentProxy(new Uint8Array(bytes));
}

// Text of one page (1-based), built the same way unpdf's extractText does:
// text items joined, with a newline where pdf.js reports an end of line.
export async function extractPageText(pdf: PdfDocument, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  page.cleanup(); // free the page's parsed data once we have its text
  return content.items
    .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""))
    .join("");
}

// Reads a whole PDF (a file path, or bytes) and returns its text page by
// page. Page numbers start at 1 so they match what the user sees in a PDF
// viewer (used later for citations). Used by the try-* scripts; the app
// indexes page batches instead (ingest.ts).
export async function extractPages(
  source: string | Uint8Array,
  label = typeof source === "string" ? source : "uploaded file",
): Promise<PageText[]> {
  const pdf = await openPdf(source);
  try {
    const pages: PageText[] = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      pages.push({ page, text: await extractPageText(pdf, page) });
    }
    if (pages.every(isEmptyPage)) {
      throw new NoTextError(label);
    }
    return pages;
  } finally {
    await pdf.loadingTask.destroy(); // free the parsed PDF
  }
}
