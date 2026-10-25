"use client";

import { FileText, Loader2, Send, Trash2, Upload } from "lucide-react";
import { type SubmitEvent, useEffect, useRef, useState } from "react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import type { Citation } from "@/src/lib/db/schema";

type DocumentItem = { id: string; name: string; chunks: number };
type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; citations: Citation[] }
  | { role: "error"; content: string };

// Reads `{ error }` from a failed API response, with a fallback message.
async function errorFrom(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

// The whole chat screen: documents on the left, conversation on the right.
// All data comes from the API routes in app/api, which check ownership.
export function ChatApp() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  // Ticked documents limit the search; none ticked = search all documents.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  async function loadDocuments() {
    const response = await fetch("/api/documents");
    if (response.ok) setDocuments(await response.json());
  }

  useEffect(() => {
    // Initial load of the document list when the page opens. The rule warns
    // about setState in effects, but fetching on mount is the intended use.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDocuments();
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

  async function upload(file: File) {
    setUploading(true);
    setUploadError("");
    const form = new FormData();
    form.append("file", file);

    try {
      const response = await fetch("/api/documents", { method: "POST", body: form });
      if (!response.ok) {
        setUploadError(await errorFrom(response, "Upload failed."));
      }
      await loadDocuments();
    } catch {
      setUploadError("Network error — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(doc: DocumentItem) {
    if (!confirm(`Delete "${doc.name}" and its index?`)) return;
    const response = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" }).catch(
      () => null,
    );
    if (!response?.ok) {
      alert(`Could not delete "${doc.name}". Try again.`);
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      next.delete(doc.id);
      return next;
    });
    await loadDocuments();
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function ask(event?: SubmitEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = question.trim();
    if (!text || asking) return;

    setQuestion("");
    setMessages((current) => [...current, { role: "user", content: text }]);
    setAsking(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, documentIds: [...selected] }),
      });

      if (response.ok) {
        const { answer, citations } = (await response.json()) as {
          answer: string;
          citations: Citation[];
        };
        setMessages((current) => [...current, { role: "assistant", content: answer, citations }]);
      } else {
        const error = await errorFrom(response, "Something went wrong.");
        setMessages((current) => [...current, { role: "error", content: error }]);
      }
    } catch {
      setMessages((current) => [
        ...current,
        { role: "error", content: "Network error — check your connection and try again." },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside className="flex max-h-[40dvh] flex-col gap-3 border-b p-4 md:max-h-none md:w-72 md:border-r md:border-b-0">
        <h1 className="text-lg font-semibold">Chat with PDF</h1>

        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = ""; // allow picking the same file again
            if (file) void upload(file);
          }}
        />
        <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {uploading ? "Indexing…" : "Upload PDF"}
        </Button>
        {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

        <p className="text-xs text-muted-foreground">
          {selected.size === 0
            ? "Searching all documents. Tick documents to narrow the search."
            : `Searching ${selected.size} selected document(s).`}
        </p>

        <ul className="-mx-1 flex flex-col gap-1 overflow-y-auto">
          {documents.length === 0 && (
            <li className="px-1 text-sm text-muted-foreground">No documents yet.</li>
          )}
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
              <input
                type="checkbox"
                aria-label={`Search in ${doc.name}`}
                checked={selected.has(doc.id)}
                onChange={() => toggle(doc.id)}
              />
              <a
                href={`/api/documents/${doc.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-sm hover:underline"
                title={`${doc.name} · ${doc.chunks} chunks`}
              >
                <FileText className="size-4 shrink-0" />
                <span className="truncate">{doc.name}</span>
              </a>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${doc.name}`}
                onClick={() => void remove(doc)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.length === 0 && (
              <p className="mt-16 text-center text-muted-foreground">
                Upload a PDF, then ask a question. Answers come only from your documents and
                cite the page.
              </p>
            )}
            {messages.map((message, i) => (
              <MessageBubble key={i} message={message} />
            ))}
            {asking && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Searching your documents…
              </p>
            )}
            <div ref={bottom} />
          </div>
        </div>

        <form onSubmit={ask} className="border-t p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <Textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter adds a new line.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask();
                }
              }}
              placeholder={
                documents.length === 0 ? "Upload a PDF first…" : "Ask about your documents…"
              }
              disabled={documents.length === 0}
              rows={2}
              className="resize-none"
            />
            <Button type="submit" size="icon" aria-label="Send" disabled={asking || !question.trim()}>
              <Send />
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 whitespace-pre-wrap text-primary-foreground">
        {message.content}
      </div>
    );
  }
  if (message.role === "error") {
    return <div className="text-sm text-destructive">{message.content}</div>;
  }

  return (
    <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2">
      <p className="whitespace-pre-wrap">{message.content}</p>
      {message.citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {message.citations.map((citation) => (
            // "#page=N" makes the browser's PDF viewer open the cited page.
            <a
              key={`${citation.documentId}:${citation.page}`}
              href={`/api/documents/${citation.documentId}/file#page=${citation.page}`}
              target="_blank"
              rel="noreferrer"
            >
              <Badge variant="outline" className="hover:bg-background">
                {citation.documentName} · p. {citation.page}
              </Badge>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
