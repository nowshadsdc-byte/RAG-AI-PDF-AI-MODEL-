// Browser side of the chunked upload (see src/lib/uploads.ts for the server).
//
// The file is cut into chunks with File.slice() (no full copy in memory).
// Each chunk is hashed (SHA-256), sent with XMLHttpRequest — fetch() has no
// upload-progress event — and retried on network errors. Progress is
// computed from real bytes: confirmed chunks + bytes of chunks in flight.
// The upload id is remembered in localStorage, so after a failure, a reload
// or closing the tab, picking the same file again resumes where it stopped.

export type UploadPhase =
  | "preparing"
  | "uploading"
  | "assembling"
  | "done"
  | "failed"
  | "cancelled";

export type UploadProgress = {
  phase: UploadPhase;
  uploadedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  // True when this run continued an earlier, interrupted upload.
  resumed: boolean;
};

export class UploadFailedError extends Error {
  constructor(
    message: string,
    // false = retrying will not help (e.g. not a PDF, server limit).
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "UploadFailedError";
  }
}

export class UploadCancelledError extends Error {
  constructor() {
    super("Upload cancelled.");
    this.name = "UploadCancelledError";
  }
}

type ServerUpload = { uploadId: string; chunkSize: number; totalChunks: number };
type ServerStatus = ServerUpload & {
  status: "uploading" | "assembling" | "complete" | "failed";
  received: number[];
  documentId: string | null;
};

const parallelChunks = 3;
const retryDelaysMs = [1000, 2000, 4000];
const speedWindowMs = 3000;

// Same file (name + size + last modified) -> same key -> resume.
function resumeKey(file: File) {
  return `upload:${file.name}:${file.size}:${file.lastModified}`;
}

// localStorage can throw (private mode, blocked storage): resume is then
// simply unavailable, the upload itself still works.
function readResumeId(file: File): string | null {
  try {
    return localStorage.getItem(resumeKey(file));
  } catch {
    return null;
  }
}
function writeResumeId(file: File, uploadId: string | null) {
  try {
    if (uploadId) localStorage.setItem(resumeKey(file), uploadId);
    else localStorage.removeItem(resumeKey(file));
  } catch {
    // ignore
  }
}

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  if (!crypto?.subtle) {
    throw new UploadFailedError(
      "This browser blocks the hashing API on plain HTTP. Open the app via https:// or localhost.",
      false,
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new UploadCancelledError());
    });
  });

// Sends one chunk; resolves when the server confirms it.
// Status 0 = network error. Rejects with { status, message }.
function putChunk(
  uploadId: string,
  index: number,
  body: Blob,
  hash: string,
  signal: AbortSignal,
  onBytes: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/uploads/${uploadId}/chunks/${index}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-Chunk-SHA256", hash);
    xhr.upload.onprogress = (event) => onBytes(event.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Chunk ${index} failed (${xhr.status}).`;
      try {
        message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
      } catch {
        // keep default
      }
      reject({ status: xhr.status, message });
    };
    xhr.onerror = () => reject({ status: 0, message: "Network error." });
    xhr.ontimeout = () => reject({ status: 0, message: "The request timed out." });
    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort, { once: true });
    xhr.onabort = () => reject(new UploadCancelledError());
    xhr.onloadend = () => signal.removeEventListener("abort", abort);
    xhr.send(body);
  });
}

// Worth retrying: network errors, timeouts, rate limits, server errors and
// a corrupted chunk (422). Other 4xx answers are final.
function isRetryable(status: number) {
  return status === 0 || status === 408 || status === 429 || status === 422 || status >= 500;
}

async function startOrResume(file: File): Promise<{ server: ServerUpload; received: number[]; resumed: boolean; documentId?: string }> {
  const savedId = readResumeId(file);
  if (savedId) {
    const response = await fetch(`/api/uploads/${savedId}`);
    if (response.ok) {
      const status = (await response.json()) as ServerStatus;
      if (status.status === "complete" && status.documentId) {
        return { server: status, received: [], resumed: true, documentId: status.documentId };
      }
      if (status.status === "uploading") {
        return { server: status, received: status.received, resumed: status.received.length > 0 };
      }
    }
    writeResumeId(file, null); // expired, failed or unknown -> start fresh
  }

  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, size: file.size }),
  });
  if (!response.ok) {
    const message = await readError(response, "Could not start the upload.");
    throw new UploadFailedError(message, response.status >= 500 && response.status !== 507);
  }
  const server = (await response.json()) as ServerUpload;
  writeResumeId(file, server.uploadId);
  return { server, received: [], resumed: false };
}

export async function uploadPdf(
  file: File,
  options: { onProgress: (progress: UploadProgress) => void; signal: AbortSignal },
): Promise<{ documentId: string }> {
  const { onProgress, signal } = options;
  const emit = (phase: UploadPhase, uploadedBytes: number, bytesPerSecond = 0, resumed = false) =>
    onProgress({ phase, uploadedBytes, totalBytes: file.size, bytesPerSecond, resumed });

  emit("preparing", 0);
  let uploadId: string | undefined;

  try {
    const start = await startOrResume(file);
    const { server } = start;
    uploadId = server.uploadId;
    if (start.documentId) {
      writeResumeId(file, null);
      emit("done", file.size, 0, true);
      return { documentId: start.documentId };
    }

    const chunkBytes = (index: number) =>
      Math.min(server.chunkSize, file.size - index * server.chunkSize);

    // --- real progress bookkeeping ---
    const done = new Set(start.received);
    let confirmed = start.received.reduce((sum, i) => sum + chunkBytes(i), 0);
    const inFlight = new Map<number, number>();
    const samples: { t: number; bytes: number }[] = [];
    const report = () => {
      const uploaded = confirmed + [...inFlight.values()].reduce((a, b) => a + b, 0);
      const now = performance.now();
      samples.push({ t: now, bytes: uploaded });
      while (samples.length > 1 && now - samples[0].t > speedWindowMs) samples.shift();
      const first = samples[0];
      const speed = now > first.t ? ((uploaded - first.bytes) / (now - first.t)) * 1000 : 0;
      emit("uploading", uploaded, Math.max(0, speed), start.resumed);
    };
    report();

    // Stops the other workers as soon as one hits a final error.
    const stop = new AbortController();
    const onCancel = () => stop.abort();
    signal.addEventListener("abort", onCancel, { once: true });

    async function sendChunk(index: number) {
      const begin = index * server.chunkSize;
      const blob = file.slice(begin, begin + chunkBytes(index));
      const hash = await sha256Hex(await blob.arrayBuffer());

      for (let attempt = 0; ; attempt++) {
        try {
          await putChunk(server.uploadId, index, blob, hash, stop.signal, (loaded) => {
            inFlight.set(index, loaded);
            report();
          });
          inFlight.delete(index);
          done.add(index);
          confirmed += blob.size;
          report();
          return;
        } catch (error) {
          inFlight.delete(index);
          report();
          if (error instanceof UploadCancelledError) throw error;
          const { status, message } = error as { status: number; message: string };
          if (!isRetryable(status) || attempt >= retryDelaysMs.length) {
            throw new UploadFailedError(message, isRetryable(status));
          }
          await sleep(retryDelaysMs[attempt], stop.signal);
        }
      }
    }

    async function sendMissing() {
      const queue = Array.from({ length: server.totalChunks }, (_, i) => i).filter((i) => !done.has(i));
      const worker = async () => {
        while (queue.length > 0) await sendChunk(queue.shift()!);
      };
      try {
        await Promise.all(Array.from({ length: Math.min(parallelChunks, queue.length) }, worker));
      } catch (error) {
        stop.abort();
        throw error;
      }
    }

    try {
      // Up to 3 rounds: if "complete" reports missing chunks, send them again.
      for (let round = 0; ; round++) {
        await sendMissing();
        emit("assembling", file.size, 0, start.resumed);

        const response = await fetch(`/api/uploads/${server.uploadId}/complete`, {
          method: "POST",
          signal: stop.signal,
        });
        if (response.ok) {
          const { documentId } = (await response.json()) as { documentId: string };
          writeResumeId(file, null);
          emit("done", file.size, 0, start.resumed);
          return { documentId };
        }

        const body = (await response.json().catch(() => null)) as
          | { error?: string; missing?: number[] }
          | null;
        if (response.status === 409 && body?.missing && round < 2) {
          for (const i of body.missing) {
            if (done.delete(i)) confirmed -= chunkBytes(i);
          }
          continue;
        }
        throw new UploadFailedError(
          body?.error ?? "Assembling the PDF failed.",
          response.status >= 500 || response.status === 409,
        );
      }
    } finally {
      signal.removeEventListener("abort", onCancel);
    }
  } catch (error) {
    if (signal.aborted || error instanceof UploadCancelledError) {
      // Cancel = also delete what the server already received.
      if (uploadId) void fetch(`/api/uploads/${uploadId}`, { method: "DELETE" }).catch(() => {});
      writeResumeId(file, null);
      throw new UploadCancelledError();
    }
    if (error instanceof UploadFailedError) {
      // A final error means resuming cannot help: forget the upload.
      if (!error.retryable) writeResumeId(file, null);
      throw error;
    }
    // fetch() itself failed: network down. Resumable.
    throw new UploadFailedError("Network error — check your connection, then retry.", true);
  }
}
