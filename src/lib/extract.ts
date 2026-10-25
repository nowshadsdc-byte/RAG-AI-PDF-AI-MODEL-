import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";

export type PageText = { page: number; text: string };

// A page with fewer characters than this is treated as empty
// (blank page, image-only page, or a scanned page without a text layer).
export const minPageChars = 20;

// Thrown when no page has real text — usually a scanned PDF (OCR is out of scope).
export class NoTextError extends Error {
  constructor(filePath: string) {
    super(`No extractable text in "${filePath}" (scanned PDF? OCR is not supported).`);
    this.name = "NoTextError";
  }
}

export function isEmptyPage(page: PageText): boolean {
  return page.text.trim().length < minPageChars;
}

// Reads a PDF and returns its text page by page. Page numbers start at 1 so
// they match what the user sees in a PDF viewer (used later for citations).
export async function extractPages(filePath: string): Promise<PageText[]> {
  const buffer = await readFile(filePath);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });

  const pages = text.map((pageText, i) => ({ page: i + 1, text: pageText }));

  if (pages.every(isEmptyPage)) {
    throw new NoTextError(filePath);
  }

  return pages;
}
