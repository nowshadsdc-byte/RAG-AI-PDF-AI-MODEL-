import { getCurrentUserId } from "@/src/lib/current-user";
import { listDocuments } from "@/src/lib/documents";

// GET /api/documents -> the current user's documents, with indexing status
// and progress (the UI polls this while a document is "processing").
// Uploading goes through the chunked /api/uploads routes.
export async function GET() {
  const userId = await getCurrentUserId();
  return Response.json(await listDocuments(userId));
}
