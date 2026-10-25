import { notFoundAnswer } from "../prompts";
import { generateAnswerWithDeepSeek } from "./deepseek";
import { type EmbedKind, embedWithGemini } from "./gemini";

export type { EmbedKind };

// The rest of the app calls only these two functions (core rule 4).
// Answers: DeepSeek via InferX. Embeddings: Gemini (768 dims).

export async function generateAnswer(
  question: string,
  passages: string[],
): Promise<string> {
  if (!question.trim()) {
    throw new Error("Question must not be empty.");
  }

  // No retrieved evidence -> never call the LLM, so it cannot invent.
  if (passages.length === 0) {
    return notFoundAnswer;
  }

  return generateAnswerWithDeepSeek(question, passages);
}

// Use kind "document" for chunks being indexed and "query" for user questions.
export async function embed(
  texts: string[],
  kind: EmbedKind = "document",
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  if (texts.some((text) => !text.trim())) {
    throw new Error("Embedding inputs must not be empty.");
  }

  return embedWithGemini(texts, kind);
}
