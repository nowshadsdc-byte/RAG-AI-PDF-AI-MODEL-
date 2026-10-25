import { indexStoredDocument } from "./ingest";

// In-process background queue for indexing uploaded PDFs.
// Concurrency is 1 on purpose: pdf.js holds a whole PDF in memory while it
// is parsed, so indexing several huge PDFs at once could exhaust RAM.
// Uploads themselves are NOT queued — many users can upload at the same time.
//
// The state is kept on globalThis so Next.js hot reload in dev does not
// create a second queue. Work lost on a server restart is picked up again
// by instrumentation.ts (documents still marked "processing").

type QueueState = { pending: string[]; running: boolean };

const globalForQueue = globalThis as typeof globalThis & { __indexQueue?: QueueState };
const state = (globalForQueue.__indexQueue ??= { pending: [], running: false });

export function enqueueIndexing(documentId: string) {
  // Tests of the upload flow set INDEX_QUEUE=off so no embedding calls run.
  if (process.env.INDEX_QUEUE === "off") return;
  if (!state.pending.includes(documentId)) state.pending.push(documentId);
  void drain();
}

async function drain() {
  if (state.running) return;
  state.running = true;
  try {
    while (state.pending.length > 0) {
      const documentId = state.pending.shift()!;
      const started = Date.now();
      console.info(`[index] start ${documentId}`);
      try {
        const { pages, chunks } = await indexStoredDocument(documentId);
        console.info(
          `[index] done ${documentId}: ${pages} pages, ${chunks} chunks in ` +
            `${((Date.now() - started) / 1000).toFixed(1)} s`,
        );
      } catch (error) {
        // The document row already has status "failed" and the message.
        console.error(`[index] failed ${documentId}:`, error);
      }
    }
  } finally {
    state.running = false;
  }
}
