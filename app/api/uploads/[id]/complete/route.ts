import { getCurrentUserId } from "@/src/lib/current-user";
import { errorResponse } from "@/src/lib/http";
import { completeUpload } from "@/src/lib/uploads";

// POST /api/uploads/:id/complete -> { documentId }
// Joins the chunks into the final PDF and queues it for indexing (202:
// accepted, indexing continues in the background — poll GET /api/documents).
// If chunks are missing it answers 409 with { missing: [...] }.
export async function POST(_request: Request, ctx: RouteContext<"/api/uploads/[id]/complete">) {
  try {
    const { id } = await ctx.params;
    const result = await completeUpload(await getCurrentUserId(), id);
    return Response.json(result, { status: 202 });
  } catch (error) {
    return errorResponse(error, "Complete upload failed");
  }
}
