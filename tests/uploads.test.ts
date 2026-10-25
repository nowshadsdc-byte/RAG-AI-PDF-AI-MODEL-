import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

// Integration tests of the chunked upload flow against the dev database.
// Files go to a temporary STORAGE_DIR; two throwaway users are created and
// deleted afterwards (their uploads and documents are removed by cascade).

let tempStorage: string;
let lib: typeof import("../src/lib/uploads");
let storage: typeof import("../src/lib/storage");
let dbModule: typeof import("../src/lib/db");
let schema: typeof import("../src/lib/db/schema");
let drizzle: typeof import("drizzle-orm");
let alice: string;
let bob: string;

const chunkSize = 8 * 1024 * 1024;
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const stream = (data: Buffer) => new Blob([new Uint8Array(data)]).stream();

// A fake "PDF": correct header and trailer around random bytes. Chunk
// handling only cares about bytes; indexing is switched off in these tests.
function fakePdf(size: number): Buffer {
  const head = Buffer.from("%PDF-1.4\n");
  const tail = Buffer.from("\n%%EOF\n");
  return Buffer.concat([head, randomBytes(size - head.length - tail.length), tail]);
}

const chunkOf = (file: Buffer, index: number) =>
  file.subarray(index * chunkSize, (index + 1) * chunkSize);

async function expectUploadError(promise: Promise<unknown>, status: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof lib.UploadError, `expected UploadError, got ${error}`);
    assert.equal(error.status, status, error.message);
    return true;
  });
}

before(async () => {
  tempStorage = await mkdtemp(path.join(tmpdir(), "rag-upload-test-"));
  process.env.STORAGE_DIR = tempStorage;
  process.env.INDEX_QUEUE = "off";
  // Imported only now, so the modules pick up STORAGE_DIR.
  lib = await import("../src/lib/uploads");
  storage = await import("../src/lib/storage");
  dbModule = await import("../src/lib/db");
  schema = await import("../src/lib/db/schema");
  drizzle = await import("drizzle-orm");

  const created = await dbModule.db
    .insert(schema.users)
    .values([
      { email: `alice-${randomUUID()}@test.local`, passwordHash: "!" },
      { email: `bob-${randomUUID()}@test.local`, passwordHash: "!" },
    ])
    .returning({ id: schema.users.id });
  [alice, bob] = created.map((u) => u.id);
});

after(async () => {
  await dbModule.db
    .delete(schema.users)
    .where(drizzle.inArray(schema.users.id, [alice, bob]));
  await dbModule.db.$client.end();
  await rm(tempStorage, { recursive: true, force: true });
});

describe("chunked uploads", () => {
  test("out-of-order and duplicate chunks rebuild the exact original file", async () => {
    const file = fakePdf(chunkSize * 2 + 12345); // 3 chunks, last one short
    const { uploadId, totalChunks } = await lib.createUpload(alice, "big.pdf", file.length);
    assert.equal(totalChunks, 3);

    for (const index of [2, 0, 1, 0]) {
      const chunk = chunkOf(file, index);
      await lib.saveChunk(alice, uploadId, index, sha(chunk), stream(chunk));
    }
    const status = await lib.getUploadStatus(alice, uploadId);
    assert.deepEqual(status.received, [0, 1, 2]);

    const { documentId } = await lib.completeUpload(alice, uploadId);
    const [doc] = await dbModule.db
      .select()
      .from(schema.documents)
      .where(drizzle.eq(schema.documents.id, documentId));
    const stored = await readFile(storage.resolveStoragePath(doc.storagePath));

    assert.equal(stored.length, file.length);
    assert.equal(sha(stored), sha(file));
    assert.equal(doc.sha256, sha(file));
    assert.equal(doc.status, "processing");
    // Temporary chunks are cleaned up after assembly.
    assert.deepEqual(await readdir(path.join(tempStorage, "uploads")).catch(() => []), []);

    // Completing again is harmless and returns the same document.
    assert.equal((await lib.completeUpload(alice, uploadId)).documentId, documentId);
  });

  test("a chunk with the wrong hash is rejected and leaves no file behind", async () => {
    const file = fakePdf(1000);
    const { uploadId } = await lib.createUpload(alice, "a.pdf", file.length);
    await expectUploadError(lib.saveChunk(alice, uploadId, 0, sha(Buffer.from("x")), stream(file)), 422);
    assert.deepEqual(await readdir(storage.uploadDir(uploadId)), []);
    assert.deepEqual((await lib.getUploadStatus(alice, uploadId)).received, []);
  });

  test("oversized, undersized and non-PDF chunks are rejected", async () => {
    const file = fakePdf(1000);
    const { uploadId } = await lib.createUpload(alice, "a.pdf", file.length);
    const bigger = Buffer.concat([file, Buffer.from("extra")]);
    await expectUploadError(lib.saveChunk(alice, uploadId, 0, sha(bigger), stream(bigger)), 400);
    const shorter = file.subarray(0, 500);
    await expectUploadError(lib.saveChunk(alice, uploadId, 0, sha(shorter), stream(shorter)), 400);
    const notPdf = Buffer.alloc(1000, 65);
    await expectUploadError(lib.saveChunk(alice, uploadId, 0, sha(notPdf), stream(notPdf)), 415);
    await expectUploadError(lib.saveChunk(alice, uploadId, 5, sha(file), stream(file)), 400);
  });

  test("the same index with different content is a conflict", async () => {
    const file = fakePdf(chunkSize + 10);
    const { uploadId } = await lib.createUpload(alice, "a.pdf", file.length);
    const last = chunkOf(file, 1);
    await lib.saveChunk(alice, uploadId, 1, sha(last), stream(last));
    const other = Buffer.from(last).fill(1);
    await expectUploadError(lib.saveChunk(alice, uploadId, 1, sha(other), stream(other)), 409);
    const again = await lib.saveChunk(alice, uploadId, 1, sha(last), stream(last));
    assert.equal(again.duplicate, true);
  });

  test("completing with a missing chunk reports it and stays resumable", async () => {
    const file = fakePdf(chunkSize + 10);
    const { uploadId } = await lib.createUpload(alice, "a.pdf", file.length);
    const first = chunkOf(file, 0);
    await lib.saveChunk(alice, uploadId, 0, sha(first), stream(first));

    await assert.rejects(lib.completeUpload(alice, uploadId), (error: unknown) => {
      assert.ok(error instanceof lib.UploadError);
      assert.equal(error.status, 409);
      assert.deepEqual(error.details?.missing, [1]);
      return true;
    });
    assert.equal((await lib.getUploadStatus(alice, uploadId)).status, "uploading");

    const last = chunkOf(file, 1);
    await lib.saveChunk(alice, uploadId, 1, sha(last), stream(last));
    const { documentId } = await lib.completeUpload(alice, uploadId);
    assert.ok(documentId);
  });

  test("two simultaneous completes create exactly one document", async () => {
    const file = fakePdf(5000);
    const { uploadId } = await lib.createUpload(alice, "a.pdf", file.length);
    await lib.saveChunk(alice, uploadId, 0, sha(file), stream(file));

    const results = await Promise.allSettled([
      lib.completeUpload(alice, uploadId),
      lib.completeUpload(alice, uploadId),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    assert.ok(ok.length >= 1);
    const docs = await dbModule.db
      .select()
      .from(schema.documents)
      .where(drizzle.and(drizzle.eq(schema.documents.userId, alice), drizzle.eq(schema.documents.sha256, sha(file))));
    assert.equal(docs.length, 1);
  });

  test("another user cannot see, write or complete the upload", async () => {
    const file = fakePdf(1000);
    const { uploadId } = await lib.createUpload(alice, "a.pdf", file.length);
    await expectUploadError(lib.getUploadStatus(bob, uploadId), 404);
    await expectUploadError(lib.saveChunk(bob, uploadId, 0, sha(file), stream(file)), 404);
    await expectUploadError(lib.completeUpload(bob, uploadId), 404);
    await expectUploadError(lib.abortUpload(bob, uploadId), 404);
  });

  test("invalid uploads are refused up front", async () => {
    await expectUploadError(lib.createUpload(alice, "notes.txt", 100), 415);
    await expectUploadError(lib.createUpload(alice, "a.pdf", 0), 400);
    process.env.MAX_UPLOAD_BYTES = "1000";
    try {
      await expectUploadError(lib.createUpload(alice, "a.pdf", 1001), 413);
    } finally {
      delete process.env.MAX_UPLOAD_BYTES;
    }
  });

  test("cancel and stale cleanup delete the chunks", async () => {
    const file = fakePdf(1000);
    const cancelled = await lib.createUpload(alice, "a.pdf", file.length);
    await lib.saveChunk(alice, cancelled.uploadId, 0, sha(file), stream(file));
    await lib.abortUpload(alice, cancelled.uploadId);
    await expectUploadError(lib.getUploadStatus(alice, cancelled.uploadId), 404);

    const stale = await lib.createUpload(alice, "a.pdf", file.length);
    await lib.saveChunk(alice, stale.uploadId, 0, sha(file), stream(file));
    await dbModule.db
      .update(schema.uploads)
      .set({ updatedAt: new Date(Date.now() - 2 * lib.staleUploadMs) })
      .where(drizzle.eq(schema.uploads.id, stale.uploadId));
    await lib.cleanupStaleUploads();
    await expectUploadError(lib.getUploadStatus(alice, stale.uploadId), 404);
    const folders = await readdir(path.join(tempStorage, "uploads"));
    assert.ok(!folders.includes(stale.uploadId));
    assert.ok(!folders.includes(cancelled.uploadId));
  });
});
