import { answerQuestion } from "@/src/lib/answer";
import { userIdOr401 } from "@/src/lib/http";
import { isUuid } from "@/src/lib/documents";
import { notFoundAnswer } from "@/src/lib/prompts";

const maxQuestionChars = 2000;

// POST /api/chat { question, documentIds? } -> { answer, citations }
export async function POST(request: Request) {
  const userId = await userIdOr401();
  if (userId instanceof Response) return userId;
  const body: unknown = await request.json().catch(() => null);

  const question =
    body && typeof body === "object" && "question" in body && typeof body.question === "string"
      ? body.question.trim()
      : "";
  if (!question || question.length > maxQuestionChars) {
    return Response.json(
      { error: `Ask a question of 1–${maxQuestionChars} characters.` },
      { status: 400 },
    );
  }

  // Optional filter: only search these documents (still limited to the user's own).
  // An empty list means "all documents".
  const requested =
    body && typeof body === "object" && "documentIds" in body && Array.isArray(body.documentIds)
      ? (body.documentIds as unknown[])
      : [];
  const documentIds = requested.filter(
    (id): id is string => typeof id === "string" && isUuid(id),
  );
  // A filter was asked for but none of the ids are valid: do not silently
  // widen the search to every document.
  if (requested.length > 0 && documentIds.length === 0) {
    return Response.json({ answer: notFoundAnswer, citations: [] });
  }

  try {
    const { answer, citations } = await answerQuestion(userId, question, documentIds);
    // Only the answer and citations go to the browser, not the raw passages.
    return Response.json({ answer, citations });
  } catch (error) {
    console.error("Chat failed:", error);
    return Response.json(
      { error: "The answer service is busy or unavailable. Try again in a moment." },
      { status: 503 },
    );
  }
}
