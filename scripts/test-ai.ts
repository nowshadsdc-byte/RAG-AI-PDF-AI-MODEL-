import "dotenv/config";
import { generateAnswer } from "../src/lib/ai";

// Smoke test: one grounded question and one that the passage cannot answer.
async function main() {
  const passages = ["The library opens at 9 am and closes at 5 pm on weekdays."];

  console.log("Grounded:", await generateAnswer("When does the library open?", passages));
  console.log("Not found:", await generateAnswer("Who is the head librarian?", passages));
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "An unknown error occurred.";
  console.error(`AI test failed: ${message}`);
  process.exitCode = 1;
});
