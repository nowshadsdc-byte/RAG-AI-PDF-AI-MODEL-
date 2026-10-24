import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { embed } from "../src/lib/ai";

// Checks the Gemini key: embeddings (used by the app) and a plain chat call.
// Direct SDK use is fine here — this is a provider test script, not app code.
async function main() {
  const [vector] = await embed(["hello world"]);
  console.log(`Embeddings OK: ${vector.length} dims`);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const started = Date.now();
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: "Explain how AI works in a few words",
  });
  console.log(`Chat OK (${Date.now() - started} ms): ${response.text?.trim()}`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "An unknown error occurred.";
  console.error(`Gemini test failed: ${message}`);
  process.exitCode = 1;
});
