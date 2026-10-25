import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { db } from "./db";
import { documents, uploadChunks, uploads } from "./db/schema";
import { isUuid } from "./documents";
import { enqueueIndexing } from "./index-queue";
import {
  checkPdfFile,
  deleteDocumentFile,
  deleteUploadDir,
  documentRelPath,
  freeDiskBytes,
  partPath,
  storageRoot,
  uploadDir,
  writeDocumentFile,
} from "./storage";
import { formatBytes } from "./format";

// Chunked, resumable PDF uploads.
//
// 1. createUpload       -> an `uploads` row + an empty folder
// 2. saveChunk (many)   -> each chunk is streamed to <n>.part, size- and
//                          SHA-256-checked, then recorded in upload_chunks
// 3. completeUpload     -> parts are streamed, in order, into one PDF, the
//                          document row is created and indexing is queued
//
// No step holds more than one small stream buffer in memory, so the file
// size is limited only by disk space (checked) and MAX_UPLOAD_BYTES (optional).
// Every function takes the user id and filters by it (core rule 5).

// 8 MB per request: small enough for common proxy limits and quick retries,
// large enough that a 1 GB file is only 128 requests.
export const uploadChunkSize = 8 * 1024 * 1024;

// Unfinished uploads untouched for this long are deleted with their parts.
export const staleUploadMs = 24 * 60 * 60 * 1000;

// An error with the HTTP status the API route should answer with.
export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

function maxUploadBytes(): number | undefined {
  const value = Number(process.env.MAX_UPLOAD_BYTES);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function expectedChunkSize(upload: { totalSize: number; chunkSize: number; totalChunks: number }, index: number) {
  return index === upload.totalChunks - 1
    ? upload.totalSize - upload.chunkSize * (upload.totalChunks - 1)
    : upload.chunkSize;
}

async function getUpload(userId: string, uploadId: string) {
  if (!isUuid(uploadId)) return undefined;
  const [upload] = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.userId, userId)));
  return upload;
}

async function requireUpload(userId: string, uploadId: string) {
  const upload = await getUpload(userId, uploadId);
  // Not found and "belongs to someone else" look the same.
  if (!upload) throw new UploadError("Upload not found.", 404);
  return upload;
}

export async function createUpload(userId: string, fileName: unknown, size: unknown) {
  if (typeof fileName !== "string" || !/\.pdf$/i.test(fileName.trim()) || fileName.length > 255) {
    throw new UploadError("Only .pdf files can be uploaded.", 415);
  }
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) {
    throw new UploadError("The file is empty or its size is invalid.", 400);
  }
  const limit = maxUploadBytes();
  if (limit && size > limit) {
    throw new UploadError(`This server accepts PDFs up to ${formatBytes(limit)}.`, 413);
  }

  // Housekeeping on the way in; a failure here must not block the upload.
  await cleanupStaleUploads().catch((error) => console.error("[upload] cleanup failed:", error));

  // Parts + the assembled file exist side by side for a moment: need 2x.
  const free = await freeDiskBytes();
  if (free < size * 2) {
    throw new UploadError(
      `Not enough free disk space on the server (needs ${formatBytes(size * 2)}, ` +
        `has ${formatBytes(free)}).`,
      507,
    );
  }

  const totalChunks = Math.ceil(size / uploadChunkSize);
  const [upload] = await db
    .insert(uploads)
    .values({ userId, fileName: fileName.trim(), totalSize: size, chunkSize: uploadChunkSize, totalChunks })
    .returning();
  await mkdir(uploadDir(upload.id), { recursive: true });
  console.info(`[upload] created ${upload.id}: ${upload.fileName}, ${formatBytes(size)}, ${totalChunks} chunks`);

  return { uploadId: upload.id, chunkSize: upload.chunkSize, totalChunks };
}

// What the client needs to resume: which chunks the server already has.
export async function getUploadStatus(userId: string, uploadId: string) {
  const upload = await requireUpload(userId, uploadId);
  const rows = await db
    .select({ chunkIndex: uploadChunks.chunkIndex })
    .from(uploadChunks)
    .where(eq(uploadChunks.uploadId, upload.id))
    .orderBy(asc(uploadChunks.chunkIndex));
  return {
    uploadId: upload.id,
    fileName: upload.fileName,
    status: upload.status,
    totalSize: upload.totalSize,
    chunkSize: upload.chunkSize,
    totalChunks: upload.totalChunks,
    received: rows.map((row) => row.chunkIndex),
    documentId: upload.documentId,
  };
}

// Streams one chunk from the request body to disk. Checks: the upload is
// still accepting chunks, the index is valid, the byte count is exactly
// what this index must have (stops reading as soon as it is exceeded),
// the SHA-256 matches the client's, and chunk 0 starts with "%PDF".
// Sending the same chunk twice is harmless (idempotent).
export async function saveChunk(
  userId: string,
  uploadId: string,
  index: number,
  sha256: string | null,
  body: ReadableStream<Uint8Array> | null,
) {
  const upload = await requireUpload(userId, uploadId);
  if (upload.status !== "uploading") {
    throw new UploadError(`This upload is ${upload.status} and no longer accepts chunks.`, 409);
  }
  if (!Number.isInteger(index) || index < 0 || index >= upload.totalChunks) {
    throw new UploadError(`Chunk index must be 0–${upload.totalChunks - 1}.`, 400);
  }
  const clientHash = sha256?.toLowerCase() ?? "";
  if (!/^[0-9a-f]{64}$/.test(clientHash)) {
    throw new UploadError("Missing or invalid X-Chunk-SHA256 header.", 400);
  }
  if (!body) throw new UploadError("Empty chunk body.", 400);

  const [existing] = await db
    .select()
    .from(uploadChunks)
    .where(and(eq(uploadChunks.uploadId, upload.id), eq(uploadChunks.chunkIndex, index)));
  if (existing) {
    if (existing.sha256 === clientHash) return { index, duplicate: true };
    throw new UploadError(`Chunk ${index} was already received with different content.`, 409);
  }

  const expected = expectedChunkSize(upload, index);
  // A unique temp name, so two identical requests racing never share a file.
  const temp = `${partPath(upload.id, index)}.${randomUUID()}.tmp`;
  const hash = createHash("sha256");
  let received = 0;
  let head = Buffer.alloc(0);

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > expected) {
        callback(new UploadError(`Chunk ${index} is larger than ${expected} bytes.`, 400));
        return;
      }
      if (index === 0 && head.length < 5) head = Buffer.concat([head, chunk]).subarray(0, 5);
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await mkdir(uploadDir(upload.id), { recursive: true });
    await pipeline(
      Readable.fromWeb(body as NodeReadableStream<Uint8Array>),
      counter,
      createWriteStream(temp),
    );

    if (received !== expected) {
      throw new UploadError(`Chunk ${index} has ${received} bytes; expected ${expected}.`, 400);
    }
    if (hash.digest("hex") !== clientHash) {
      throw new UploadError(`Chunk ${index} is corrupted (SHA-256 mismatch). Retry it.`, 422);
    }
    if (index === 0 && head.toString("latin1") !== "%PDF-") {
      throw new UploadError("This file is not a PDF.", 415);
    }

    // Claim the index in the DB first; only the winner moves its file into
    // place, so a concurrent duplicate can never overwrite a recorded part.
    const inserted = await db
      .insert(uploadChunks)
      .values({ uploadId: upload.id, chunkIndex: index, size: received, sha256: clientHash })
      .onConflictDoNothing()
      .returning({ chunkIndex: uploadChunks.chunkIndex });
    if (inserted.length === 0) {
      await rm(temp, { force: true });
      return { index, duplicate: true };
    }
    await rename(temp, partPath(upload.id, index));
    await db.update(uploads).set({ updatedAt: new Date() }).where(eq(uploads.id, upload.id));
    return { index, duplicate: false };
  } catch (error) {
    await rm(temp, { force: true });
    if (error instanceof UploadError) throw error;
    // Usually the client went away mid-chunk; it will resend this chunk.
    throw new UploadError(`Chunk ${index} was interrupted. Retry it.`, 400);
  }
}

// Joins all parts into the final PDF and creates the document.
// Safe to call twice: a finished upload returns its document again, and
// a concurrent second call is refused while the first one is assembling.
export async function completeUpload(userId: string, uploadId: string) {
  const upload = await requireUpload(userId, uploadId);
  if (upload.status === "complete" && upload.documentId) {
    return { documentId: upload.documentId };
  }

  // Atomic lock: only one request can move "uploading" -> "assembling".
  const [locked] = await db
    .update(uploads)
    .set({ status: "assembling", updatedAt: new Date() })
    .where(and(eq(uploads.id, upload.id), eq(uploads.status, "uploading")))
    .returning();
  if (!locked) {
    throw new UploadError(`This upload is ${upload.status}; it cannot be completed now.`, 409);
  }

  const documentId = randomUUID();
  const relPath = documentRelPath(documentId);
  let fileWritten = false;
  // Most problems are fixable by sending chunks again -> back to "uploading".
  let nextStatus: "uploading" | "failed" = "uploading";

  try {
    const rows = await db
      .select()
      .from(uploadChunks)
      .where(eq(uploadChunks.uploadId, upload.id))
      .orderBy(asc(uploadChunks.chunkIndex));

    // Every index 0..n-1 must be recorded AND its part file must be on disk
    // with the recorded size. A row without a good file is dropped so the
    // client re-sends that chunk.
    const byIndex = new Map(rows.map((row) => [row.chunkIndex, row]));
    const missing: number[] = [];
    for (let i = 0; i < upload.totalChunks; i++) {
      const row = byIndex.get(i);
      const size = row ? await stat(partPath(upload.id, i)).then((s) => s.size, () => -1) : -1;
      if (!row || size !== row.size) missing.push(i);
    }
    if (missing.length > 0) {
      throw new UploadError(`${missing.length} chunk(s) are missing.`, 409, { missing });
    }

    const free = await freeDiskBytes();
    if (free < upload.totalSize) {
      throw new UploadError("Not enough free disk space on the server to assemble the file.", 507);
    }

    // Stream the parts in index order into the final file. Each part is
    // re-hashed on the way, which catches a part damaged on disk since upload.
    const sources = rows.map((row) => () => {
      const partHash = createHash("sha256");
      const verify = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          partHash.update(chunk);
          callback(null, chunk);
        },
        flush(callback) {
          const ok = partHash.digest("hex") === row.sha256;
          callback(ok ? null : new UploadError(`Chunk ${row.chunkIndex} is damaged on disk.`, 409, { missing: [row.chunkIndex] }));
        },
      });
      return createReadStream(partPath(upload.id, row.chunkIndex)).pipe(verify);
    });
    const { size, sha256 } = await writeDocumentFile(relPath, sources);
    fileWritten = true;

    if (size !== upload.totalSize) {
      nextStatus = "failed";
      throw new UploadError(`Assembled file has ${size} bytes; expected ${upload.totalSize}.`, 500);
    }
    const { hasHeader, hasEof } = await checkPdfFile(relPath);
    if (!hasHeader) {
      nextStatus = "failed";
      throw new UploadError("The assembled file is not a PDF.", 415);
    }
    if (!hasEof) {
      // Bytes are exactly what the browser sent (every chunk hash matched),
      // so this is the original file; it may simply be an unusual PDF.
      // pdf.js decides during indexing. Logged, not rejected.
      console.warn(`[upload] ${upload.id}: no %%EOF marker near the end of ${upload.fileName}`);
    }

    await db.transaction(async (tx) => {
      await tx.insert(documents).values({
        id: documentId,
        userId,
        name: upload.fileName,
        storagePath: relPath,
        status: "processing",
        sizeBytes: size,
        sha256,
      });
      await tx
        .update(uploads)
        .set({ status: "complete", documentId, updatedAt: new Date() })
        .where(eq(uploads.id, upload.id));
      await tx.delete(uploadChunks).where(eq(uploadChunks.uploadId, upload.id));
    });

    await deleteUploadDir(upload.id);
    console.info(`[upload] complete ${upload.id} -> document ${documentId} (sha256 ${sha256})`);
    enqueueIndexing(documentId);
    return { documentId };
  } catch (error) {
    if (fileWritten) await deleteDocumentFile(relPath);
    // Forget chunks that are missing or damaged so the client re-sends them.
    const missing = error instanceof UploadError ? error.details?.missing : undefined;
    if (Array.isArray(missing) && missing.length > 0) {
      await db
        .delete(uploadChunks)
        .where(and(eq(uploadChunks.uploadId, upload.id), inArray(uploadChunks.chunkIndex, missing)));
    }
    await db
      .update(uploads)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(uploads.id, upload.id));
    console.error(`[upload] complete failed ${upload.id}:`, error);
    if (error instanceof UploadError) throw error;
    throw new UploadError("Assembling the PDF failed. Try again.", 500);
  }
}

export async function abortUpload(userId: string, uploadId: string) {
  const upload = await requireUpload(userId, uploadId);
  if (upload.status === "assembling") {
    throw new UploadError("The upload is being assembled and cannot be cancelled now.", 409);
  }
  await db.delete(uploads).where(eq(uploads.id, upload.id));
  await deleteUploadDir(upload.id);
}

// Deletes uploads not touched for `maxAgeMs` (their parts too) and any
// leftover folder in storage/uploads that has no row any more.
export async function cleanupStaleUploads(maxAgeMs = staleUploadMs) {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const stale = await db
    .delete(uploads)
    .where(lt(uploads.updatedAt, cutoff))
    .returning({ id: uploads.id });
  for (const { id } of stale) await deleteUploadDir(id);

  let orphans = 0;
  const folders = await readdir(path.join(storageRoot, "uploads")).catch(() => [] as string[]);
  if (folders.length > 0) {
    const known = new Set(
      (
        await db
          .select({ id: uploads.id })
          .from(uploads)
          .where(inArray(uploads.id, folders.filter(isUuid)))
      ).map((row) => row.id),
    );
    for (const folder of folders) {
      if (known.has(folder)) continue;
      const info = await stat(uploadDir(folder)).catch(() => undefined);
      if (info && Date.now() - info.mtimeMs > maxAgeMs) {
        await deleteUploadDir(folder);
        orphans++;
      }
    }
  }

  if (stale.length + orphans > 0) {
    console.info(`[upload] cleanup removed ${stale.length} stale upload(s), ${orphans} orphan folder(s)`);
  }
  return { removed: stale.length, orphans };
}

// After a server restart: an assembly that was cut off can be retried.
export async function resetInterruptedAssemblies() {
  await db
    .update(uploads)
    .set({ status: "uploading" })
    .where(eq(uploads.status, "assembling"));
}

