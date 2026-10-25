import { getCurrentUserId } from "@/src/lib/current-user";
import { errorResponse } from "@/src/lib/http";
import { createUpload } from "@/src/lib/uploads";

// POST /api/uploads { fileName, size } -> { uploadId, chunkSize, totalChunks }
// Starts a chunked upload. No file bytes are sent here.
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = (await request.json().catch(() => null)) as {
      fileName?: unknown;
      size?: unknown;
    } | null;
    const result = await createUpload(userId, body?.fileName, body?.size);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Create upload failed");
  }
}
