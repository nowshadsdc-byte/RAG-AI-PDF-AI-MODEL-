import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";

export type PageText = { page: number; text: string };

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

// Reads a PDF (a file path, or the bytes of an upload) and returns its text
// page by page. Page numbers start at 1 so they match what the user sees in a
// PDF viewer (used later for citations).
export async function extractPages(
  source: string | Uint8Array,
  label = typeof source === "string" ? source : "uploaded file",
): Promise<PageText[]> {
  // pdf.js takes ownership of the bytes it is given, so always pass a copy.
  // `new Uint8Array(x)` copies, and also turns a Node Buffer into a plain
  // Uint8Array, which unpdf requires.
  const bytes = typeof source === "string" ? await readFile(source) : source;
  const data = new Uint8Array(bytes);
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });

  const pages = text.map((pageText, i) => ({ page: i + 1, text: pageText }));

  if (pages.every(isEmptyPage)) {
    throw new NoTextError(label);
  }

  return pages;
}
