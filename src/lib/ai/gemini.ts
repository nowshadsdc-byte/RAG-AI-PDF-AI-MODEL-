import { ApiError, GoogleGenAI } from "@google/genai";

const embeddingModel = "gemini-embedding-001";
export const embeddingDimensions = 768;
// Inputs sent per API call; a large PDF is embedded in several calls.
// 20 chunks × ~600 tokens ≈ 12k tokens, well under the free tier's 30k
// tokens/minute, so a 429 is the exception rather than every other call.
const batchSize = 20;

// Documents and questions are embedded differently so a short question
// lands close to the passage that answers it.
export type EmbedKind = "document" | "query";
const taskTypes: Record<EmbedKind, string> = {
  document: "RETRIEVAL_DOCUMENT",
  query: "RETRIEVAL_QUERY",
};

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required. Set it in your local .env file.");
  }

  return new GoogleGenAI({ apiKey });
}

// Gemini is kept only for embeddings: InferX (DeepSeek) has no embedding model.
export async function embedWithGemini(
  texts: string[],
  kind: EmbedKind,
): Promise<number[][]> {
  const client = getClient();
  const vectors: number[][] = [];

  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    vectors.push(...(await embedBatch(client, batch, kind)));
  }

  return vectors;
}

// Use the wait Gemini suggests (+1 s margin, at most 65 s); otherwise
// back off 2/4/6… s.
function retryDelayMs(error: ApiError, attempt: number): number {
  const suggested = /retry in ([\d.]+)s/i.exec(error.message);
  if (suggested) return Math.min(Number(suggested[1]) * 1000 + 1000, 65_000);
  return attempt * 2000;
}

async function embedBatch(
  client: GoogleGenAI,
  texts: string[],
  kind: EmbedKind,
): Promise<number[][]> {
  const request = () =>
    client.models.embedContent({
      model: embeddingModel,
      contents: texts,
      config: {
        outputDimensionality: embeddingDimensions,
        taskType: taskTypes[kind],
      },
    });

  // The free tier answers 429 when we send too fast (503 when Gemini is
  // overloaded); wait and retry. The free tier allows 30,000 embedding
  // tokens per minute, so a large PDF hits it often — Gemini then says how
  // long to wait ("retry in 16.6s"), and we wait that long instead of
  // giving up.
  let response;
  for (let attempt = 1; ; attempt++) {
    try {
      response = await request();
      break;
    } catch (error) {
      const retryable =
        error instanceof ApiError && (error.status === 429 || error.status === 503);
      if (!retryable || attempt > 6) throw error;
      // The daily quota does not reset in a minute: fail now with a clear
      // reason instead of retrying for minutes and failing anyway.
      if (/PerDay/i.test(error.message)) {
        throw new Error("Daily Gemini embedding quota reached — try again tomorrow.");
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(error, attempt)));
    }
  }

  const embeddings = response.embeddings;
  if (!embeddings || embeddings.length !== texts.length) {
    throw new Error("Gemini did not return one embedding per input.");
  }

  return embeddings.map((embedding) => {
    const values = embedding.values;
    if (
      !values ||
      values.length !== embeddingDimensions ||
      values.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Gemini embeddings must contain ${embeddingDimensions} finite values per input.`,
      );
    }

    return values;
  });
}
