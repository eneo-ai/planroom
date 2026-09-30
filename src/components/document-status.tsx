"use client";

import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Selector } from "@astryxdesign/core/Selector";
import {
  statusSchema,
  type DocumentDetail,
  type DocumentStatus,
  type DocumentSummary,
} from "@/contracts";
import { statuses, statusOptions } from "@/client/document-format";
import { api } from "@/client/api";

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const variant =
    status === "ready"
      ? "purple"
      : status === "active" || status === "in_development"
        ? "blue"
        : status === "completed"
          ? "teal"
          : "neutral";
  return <Badge label={statuses[status]} variant={variant} />;
}

export function DocumentStatusControl({
  document,
  isDisabled = false,
  disabledMessage,
  onUpdated,
  onError,
  onSavingChange,
}: {
  document: Pick<
    DocumentSummary,
    "id" | "title" | "status" | "currentRevision"
  >;
  isDisabled?: boolean;
  disabledMessage?: string;
  onUpdated: (next: DocumentDetail) => void;
  onError: (cause: unknown) => void;
  onSavingChange?: (saving: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function change(value: string) {
    const status = statusSchema.parse(value);
    if (isDisabled || busy || status === document.status) return;
    setBusy(true);
    onSavingChange?.(true);
    try {
      onUpdated(
        await api<DocumentDetail>(`/api/documents/${document.id}/status`, {
          method: "PUT",
          body: JSON.stringify({
            status,
            expectedRevision: document.currentRevision,
          }),
        }),
      );
    } catch (cause) {
      onError(cause);
    } finally {
      setBusy(false);
      onSavingChange?.(false);
    }
  }
  return (
    <Selector
      label={`Status för ${document.title}`}
      isLabelHidden
      variant="ghost"
      size="sm"
      options={statusOptions}
      value={document.status}
      onChange={(value) => void change(value)}
      renderValue={() => <DocumentStatusBadge status={document.status} />}
      isDisabled={isDisabled || busy}
      disabledMessage={disabledMessage}
      isLoading={busy}
      presentation="adaptive"
    />
  );
}
