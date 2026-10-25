import type { PageText } from "./extract";

// Cleans the text of one page. Order matters: hyphenated line breaks must be
// joined before newlines are collapsed into spaces.
export function cleanText(text: string): string {
  return (
    text
      // pdf.js emits NUL (\x00) and other control characters for glyphs it
      // cannot map (common in Bangla PDFs). PostgreSQL rejects NUL in text
      // columns, so they must go. \t and \n are kept for the steps below.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      // "informa-\ntion" -> "information"
      .replace(/(\w)-\s*\n\s*(\w)/g, "$1$2")
      // Any run of whitespace (spaces, tabs, newlines) -> one space
      .replace(/\s+/g, " ")
      .trim()
  );
}

// A line that appears on most pages (e.g. a running header, footer or
// copyright notice) adds noise to every chunk, so it is removed.
// Only applied to PDFs with at least 3 pages, otherwise "most" is meaningless.
export function removeRepeatedLines(pages: PageText[], ratio = 0.6): PageText[] {
  if (pages.length < 3) return pages;

  // Digits are masked so "Page 3" and "Page 4" count as the same footer line.
  const lineKey = (line: string) => line.trim().replace(/\d+/g, "#");

  const lineCounts = new Map<string, number>();
  for (const page of pages) {
    // Count each line once per page.
    const lines = new Set(page.text.split("\n").map(lineKey));
    for (const line of lines) {
      if (line) lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);
    }
  }

  const repeated = new Set(
    [...lineCounts]
      .filter(([, count]) => count >= pages.length * ratio)
      .map(([line]) => line),
  );
  if (repeated.size === 0) return pages;

  return pages.map((page) => ({
    page: page.page,
    text: page.text
      .split("\n")
      .filter((line) => !repeated.has(lineKey(line)))
      .join("\n"),
  }));
}

// Full cleaning step: drop repeated header/footer lines, then clean each page.
// Page numbers are kept unchanged.
export function cleanPages(pages: PageText[]): PageText[] {
  return removeRepeatedLines(pages).map((page) => ({
    page: page.page,
    text: cleanText(page.text),
  }));
}
