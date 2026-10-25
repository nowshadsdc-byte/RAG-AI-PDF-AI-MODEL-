import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Uploaded PDFs live outside /public so they can only be reached through an
// API route that checks ownership first (core rule 5).
const storageDir = path.join("storage", "documents");

// The DB stores this relative path; the file name is the document's UUID,
// never the user's original file name.
export function storagePathFor(documentId: string): string {
  return path.posix.join("storage", "documents", `${documentId}.pdf`);
}

export async function saveDocumentFile(documentId: string, data: Uint8Array) {
  await mkdir(storageDir, { recursive: true });
  await writeFile(storagePathFor(documentId), data);
}

export function readDocumentFile(storagePath: string): Promise<Buffer> {
  return readFile(path.resolve(storagePath));
}

export async function deleteDocumentFile(storagePath: string) {
  // `force` ignores a file that is already gone.
  await rm(path.resolve(storagePath), { force: true });
}
