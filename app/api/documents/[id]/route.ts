import { userIdOr401 } from "@/src/lib/http";
import { deleteDocument } from "@/src/lib/documents";

// DELETE /api/documents/:id -> removes the row, its chunks and the PDF file.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const userId = await userIdOr401();
  if (userId instanceof Response) return userId;

  // Not found and "belongs to someone else" give the same 404, so the API
  // never reveals which document ids exist.
  if (!(await deleteDocument(userId, id))) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
