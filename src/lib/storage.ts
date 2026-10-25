import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat, statfs } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// All files live under ONE root, outside /public, so a PDF can only be
// reached through an API route that checks ownership first (core rule 5).
// STORAGE_DIR (absolute) is used in Docker and tests; otherwise ./storage
// relative to where the app/script is started (the project root).
// The ignore comment tells Turbopack not to trace this runtime folder into
// the build (it holds user files, not app code).
export const storageRoot = path.resolve(
  /*turbopackIgnore: true*/ process.env.STORAGE_DIR || "storage",
);

// The DB stores paths relative to the storage root, e.g. "documents/<uuid>.pdf".
// The file name is the document's UUID, never the user's original file name.
export function documentRelPath(documentId: string): string {
  return path.posix.join("documents", `${documentId}.pdf`);
}

export function resolveStoragePath(relPath: string): string {
  return path.join(storageRoot, relPath);
}

// Chunked uploads: storage/uploads/<uploadId>/<chunkIndex>.part
export function uploadDir(uploadId: string): string {
  return path.join(storageRoot, "uploads", uploadId);
}

export function partPath(uploadId: string, chunkIndex: number): string {
  return path.join(uploadDir(uploadId), `${chunkIndex}.part`);
}

// Free bytes on the disk that holds the storage root.
export async function freeDiskBytes(): Promise<number> {
  await mkdir(storageRoot, { recursive: true });
  const info = await statfs(storageRoot);
  return info.bavail * info.bsize;
}

// Streams one or more sources, in order, into a document file while
// counting bytes and computing SHA-256. Only one small buffer is in memory
// at a time, whatever the file size. The file is written as *.tmp and
// renamed at the end, so a half-written file never looks like a real one.
export async function writeDocumentFile(
  relPath: string,
  sources: (() => Readable)[],
): Promise<{ size: number; sha256: string }> {
  const target = resolveStoragePath(relPath);
  const temp = `${target}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });

  const hash = createHash("sha256");
  let size = 0;
  async function* concat() {
    for (const open of sources) {
      for await (const chunk of open()) {
        hash.update(chunk as Buffer);
        size += (chunk as Buffer).length;
        yield chunk as Buffer;
      }
    }
  }

  try {
    await pipeline(concat, createWriteStream(temp));
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  return { size, sha256: hash.digest("hex") };
}

// Reads `length` bytes at `position` without loading the rest of the file.
async function readBytes(filePath: string, position: number, length: number) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

// Cheap structural check of a stored PDF: it must start with "%PDF-", and a
// complete PDF ends with "%%EOF" (we look in the last 2 KB, since some
// writers append a few bytes after it).
export async function checkPdfFile(relPath: string) {
  const filePath = resolveStoragePath(relPath);
  const { size } = await stat(filePath);
  const head = await readBytes(filePath, 0, 5);
  const tail = await readBytes(filePath, Math.max(0, size - 2048), 2048);
  return {
    hasHeader: head.toString("latin1") === "%PDF-",
    hasEof: tail.toString("latin1").includes("%%EOF"),
  };
}

// Size of a stored file, or undefined if it is missing.
export async function storedFileSize(relPath: string): Promise<number | undefined> {
  try {
    return (await stat(resolveStoragePath(relPath))).size;
  } catch {
    return undefined;
  }
}

export function openDocumentStream(relPath: string): Readable {
  return createReadStream(resolveStoragePath(relPath));
}

export async function deleteDocumentFile(relPath: string) {
  // `force` ignores a file that is already gone.
  await rm(resolveStoragePath(relPath), { force: true });
}

export async function deleteUploadDir(uploadId: string) {
  await rm(uploadDir(uploadId), { recursive: true, force: true });
}
