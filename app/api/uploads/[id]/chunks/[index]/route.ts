import { getCurrentUserId } from "@/src/lib/current-user";
import { errorResponse } from "@/src/lib/http";
import { saveChunk } from "@/src/lib/uploads";

// PUT /api/uploads/:id/chunks/:index
// Body: the raw chunk bytes (application/octet-stream).
// Header: X-Chunk-SHA256 = hex SHA-256 of those bytes.
// The body is streamed straight to disk, never read into memory as a whole.
export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/uploads/[id]/chunks/[index]">,
) {
  try {
    const { id, index } = await ctx.params;
    const chunkIndex = /^\d+$/.test(index) ? Number(index) : -1;
    const result = await saveChunk(
      await getCurrentUserId(),
      id,
      chunkIndex,
      request.headers.get("x-chunk-sha256"),
      request.body,
    );
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "Save chunk failed");
  }
}
