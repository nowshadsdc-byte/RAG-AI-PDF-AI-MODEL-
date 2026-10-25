import { getCurrentUserId } from "@/src/lib/current-user";
import { getDocument } from "@/src/lib/documents";
import { readDocumentFile } from "@/src/lib/storage";

// GET /api/documents/:id/file -> the PDF itself, only for its owner
// (core rule 5). Citation links add "#page=N" so the browser's PDF viewer
// opens at the cited page.
export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  const { id } = await ctx.params;
  const userId = await getCurrentUserId();

  const document = await getDocument(userId, id);
  if (!document) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  const data = await readDocumentFile(document.storagePath);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      // "inline" shows it in the browser; the name is encoded so any
      // characters in the original file name are safe in the header.
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
