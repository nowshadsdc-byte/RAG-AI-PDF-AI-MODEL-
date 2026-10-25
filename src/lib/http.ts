import { UploadError } from "./uploads";

// Turns an error into a JSON response: UploadError carries its own status
// and message (safe to show); anything else is logged and hidden.
export function errorResponse(error: unknown, context: string): Response {
  if (error instanceof UploadError) {
    return Response.json({ error: error.message, ...error.details }, { status: error.status });
  }
  console.error(`${context}:`, error);
  return Response.json({ error: "Something went wrong on the server. Try again." }, { status: 500 });
}
