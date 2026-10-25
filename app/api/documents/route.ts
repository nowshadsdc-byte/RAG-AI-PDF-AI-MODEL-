import { getCurrentUserId } from "@/src/lib/current-user";
import { listDocuments } from "@/src/lib/documents";
import { NoTextError } from "@/src/lib/extract";
import { ingestPdf } from "@/src/lib/ingest";

const maxUploadBytes = 20 * 1024 * 1024;

// GET /api/documents -> the current user's documents.
export async function GET() {
  const userId = await getCurrentUserId();
  return Response.json(await listDocuments(userId));
}

// POST /api/documents (multipart, field "file") -> upload and index a PDF.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > maxUploadBytes) {
    return Response.json({ error: "The PDF must be 20 MB or smaller." }, { status: 413 });
  }

  const data = new Uint8Array(await file.arrayBuffer());
  // Check the real file header, not just the name: every PDF starts with "%PDF".
  if (new TextDecoder().decode(data.slice(0, 4)) !== "%PDF") {
    return Response.json({ error: "Only PDF files are supported." }, { status: 415 });
  }

  try {
    const result = await ingestPdf(userId, file.name, data);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof NoTextError) {
      return Response.json(
        { error: "This PDF has no selectable text (scanned PDFs are not supported)." },
        { status: 422 },
      );
    }
    console.error("Upload failed:", error);
    return Response.json({ error: "Indexing the PDF failed. Try again." }, { status: 500 });
  }
}
