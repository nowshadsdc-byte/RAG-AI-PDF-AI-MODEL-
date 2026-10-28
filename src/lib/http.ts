import { getCurrentUserId, UnauthorizedError } from "./current-user";
import { UploadError } from "./uploads";

// For routes without a try/catch: the session user's id, or a ready 401.
// Usage: const userId = await userIdOr401(); if (userId instanceof Response) return userId;
export async function userIdOr401(): Promise<string | Response> {
  try {
    return await getCurrentUserId();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}

// Turns an error into a JSON response: UploadError carries its own status
// and message (safe to show); no session -> 401; anything else is logged
// and hidden.
export function errorResponse(error: unknown, context: string): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof UploadError) {
    return Response.json({ error: error.message, ...error.details }, { status: error.status });
  }
  console.error(`${context}:`, error);
  return Response.json({ error: "Something went wrong on the server. Try again." }, { status: 500 });
}
