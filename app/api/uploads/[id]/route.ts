import { getCurrentUserId } from "@/src/lib/current-user";
import { errorResponse } from "@/src/lib/http";
import { abortUpload, getUploadStatus } from "@/src/lib/uploads";

// GET /api/uploads/:id -> status + the chunk indexes already received
// (the client uploads only the missing ones when it resumes).
export async function GET(_request: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  try {
    const { id } = await ctx.params;
    return Response.json(await getUploadStatus(await getCurrentUserId(), id));
  } catch (error) {
    return errorResponse(error, "Upload status failed");
  }
}

// DELETE /api/uploads/:id -> cancel and delete the received chunks.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  try {
    const { id } = await ctx.params;
    await abortUpload(await getCurrentUserId(), id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, "Cancel upload failed");
  }
}
