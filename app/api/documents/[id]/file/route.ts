import { Readable } from "node:stream";
import { userIdOr401 } from "@/src/lib/http";
import { getDocument } from "@/src/lib/documents";
import { openDocumentStream, storedFileSize } from "@/src/lib/storage";

// GET /api/documents/:id/file -> the PDF itself, only for its owner
// (core rule 5). Streamed from disk, so a very large PDF is never loaded
// into memory. Citation links add "#page=N" so the browser's PDF viewer
// opens at the cited page.
export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  const { id } = await ctx.params;
  const userId = await userIdOr401();
  if (userId instanceof Response) return userId;

  const document = await getDocument(userId, id);
  const size = document && (await storedFileSize(document.storagePath));
  if (!document || size === undefined) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  const stream = Readable.toWeb(openDocumentStream(document.storagePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(size),
      // "inline" shows it in the browser; the name is encoded so any
      // characters in the original file name are safe in the header.
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
