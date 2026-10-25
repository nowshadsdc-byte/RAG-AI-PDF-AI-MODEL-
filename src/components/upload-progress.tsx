"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { CheckCircle2, FileText, Loader2, RotateCw, X, XCircle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import type { UploadProgress as Progress } from "@/src/lib/upload-client";
import { cn } from "@/src/lib/utils";
import { formatBytes } from "@/src/lib/format";

export type UploadItem = {
  key: string;
  file: File;
  progress: Progress;
  error?: string;
  retryable?: boolean;
  documentId?: string;
};

// Indexing progress of the uploaded document, from GET /api/documents.
export type IndexingInfo = {
  status: "processing" | "ready" | "failed";
  indexedPages: number;
  pageCount: number | null;
  error: string | null;
};


// One card per upload. Every number on it comes from real events: XHR
// upload progress while sending, the server's indexed page count after.
export function UploadProgressCard({
  item,
  indexing,
  onRetry,
  onCancel,
  onDismiss,
}: {
  item: UploadItem;
  indexing?: IndexingInfo;
  onRetry: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const { phase, uploadedBytes, totalBytes, bytesPerSecond, resumed } = item.progress;

  // After the upload, the same card follows indexing.
  const indexingFailed = indexing?.status === "failed";
  const indexingDone = indexing?.status === "ready";
  const indexingRunning = phase === "done" && !indexingDone && !indexingFailed;

  const uploadPercent = totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0;
  const indexPercent =
    indexing?.pageCount ? (indexing.indexedPages / indexing.pageCount) * 100 : 0;
  const percent = phase === "done" ? (indexingDone ? 100 : indexPercent) : uploadPercent;

  const failed = phase === "failed" || indexingFailed;
  const finished = phase === "done" && indexingDone;

  let label: string;
  if (phase === "preparing") label = "Preparing…";
  else if (phase === "uploading") label = resumed ? "Resuming upload…" : "Uploading…";
  else if (phase === "assembling") label = "Verifying and assembling the PDF…";
  else if (phase === "failed") label = item.error ?? "Upload failed.";
  else if (phase === "cancelled") label = "Cancelled.";
  else if (indexingFailed) label = indexing?.error ?? "Indexing failed.";
  else if (indexingDone) label = "Ready — you can ask questions about it.";
  else if (indexing?.pageCount) label = `Indexing page ${indexing.indexedPages} of ${indexing.pageCount}…`;
  else label = "Uploaded — starting indexing…";

  const detail =
    phase === "uploading" || phase === "preparing"
      ? `${Math.floor(uploadPercent)}% · ${formatBytes(uploadedBytes)} of ${formatBytes(totalBytes)}` +
        (bytesPerSecond > 0 ? ` · ${formatBytes(bytesPerSecond)}/s` : "")
      : phase === "failed"
        ? `${formatBytes(uploadedBytes)} of ${formatBytes(totalBytes)} uploaded`
        : indexingRunning && indexing?.pageCount
          ? `${Math.floor(indexPercent)}% indexed · ${formatBytes(totalBytes)}`
          : formatBytes(totalBytes);

  const busy = phase === "preparing" || phase === "uploading" || phase === "assembling";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm transition-colors",
        failed && "border-destructive/50 bg-destructive/5",
        finished && "border-emerald-500/40 bg-emerald-500/5",
      )}
    >
      <div className="flex items-start gap-2">
        {finished ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        ) : failed ? (
          <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        ) : busy || indexingRunning ? (
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <FileText className="mt-0.5 size-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={item.file.name}>
            {item.file.name}
          </p>
          <p className={cn("text-xs", failed ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
            {label}
          </p>
        </div>
        {busy && (
          <Button variant="ghost" size="icon-xs" aria-label="Cancel upload" onClick={onCancel}>
            <X />
          </Button>
        )}
        {!busy && (failed || finished || phase === "cancelled") && (
          <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={onDismiss}>
            <X />
          </Button>
        )}
      </div>

      <ProgressPrimitive.Root value={Math.min(100, percent)} className="mt-2" aria-label={`${item.file.name}: ${label}`}>
        <ProgressPrimitive.Track className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <ProgressPrimitive.Indicator
            className={cn(
              // Width follows real bytes/pages; the transition only smooths
              // the jump between two real progress events.
              "h-full rounded-full transition-[width] duration-300 ease-out",
              failed ? "bg-destructive" : finished ? "bg-emerald-500" : "bg-primary",
              (phase === "assembling" || (indexingRunning && !indexing?.pageCount)) && "animate-pulse",
            )}
          />
        </ProgressPrimitive.Track>
      </ProgressPrimitive.Root>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">{detail}</span>
        {phase === "failed" && item.retryable && (
          <Button size="xs" variant="outline" onClick={onRetry}>
            <RotateCw /> Retry
          </Button>
        )}
      </div>
    </div>
  );
}
