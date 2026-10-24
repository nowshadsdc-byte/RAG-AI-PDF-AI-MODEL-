import { GoogleGenAI } from "@google/genai";

const embeddingModel = "gemini-embedding-001";
export const embeddingDimensions = 768;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required. Set it in your local .env file.");
  }

  return new GoogleGenAI({ apiKey });
}

// Gemini is kept only for embeddings: InferX (DeepSeek) has no embedding model.
export async function embedWithGemini(texts: string[]): Promise<number[][]> {
  const client = getClient();
  const response = await client.models.embedContent({
    model: embeddingModel,
    contents: texts,
    config: {
      outputDimensionality: embeddingDimensions,
    },
  });

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
