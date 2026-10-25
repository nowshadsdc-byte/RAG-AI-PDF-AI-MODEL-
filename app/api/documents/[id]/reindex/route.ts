import { getCurrentUserId } from "@/src/lib/current-user";
import { markForReindex } from "@/src/lib/documents";
import { enqueueIndexing } from "@/src/lib/index-queue";

// POST /api/documents/:id/reindex -> retry indexing a document that failed.
export async function POST(_request: Request, ctx: RouteContext<"/api/documents/[id]/reindex">) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserId();

  if (!(await markForReindex(userId, id))) {
    return Response.json(
      { error: "Document not found or not in a failed state." },
      { status: 404 },
    );
  }
  enqueueIndexing(id);
  return Response.json({ documentId: id }, { status: 202 });
}
