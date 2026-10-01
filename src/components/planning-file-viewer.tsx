"use client";

import { useMemo, useState } from "react";
import { Selector } from "@astryxdesign/core/Selector";
import { Banner } from "@astryxdesign/core/Banner";
import type { PlanningFile } from "@/contracts";
import { markdownHtml } from "@/client/markdown-preview";
import { HtmlViewer } from "./html-viewer";
import { DocumentFileExport } from "./document-export";

export function PlanningFileViewer({
  files,
  title,
  documentId,
  hasDraft = false,
}: {
  files: PlanningFile[];
  title: string;
  documentId?: string;
  hasDraft?: boolean;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = files.find((file) => file.id === selectedId) ?? files[0];
  const html = useMemo(() => {
    if (!selected) return "";
    return selected.format === "markdown"
      ? markdownHtml(selected.content)
      : selected.content;
  }, [selected]);
  if (!selected)
    return (
      <Banner
        status="info"
        title="Lägg till en planeringsfil"
        description="Importera HTML eller Markdown, eller skapa en ny fil i innehållsfliken."
      />
    );
  return (
    <div className="page-stack">
      <div className="button-row">
        <Selector
          label="Planeringsfil"
          options={files.map((file) => ({
            value: file.id,
            label: file.name || "Namnlös fil",
          }))}
          value={selected.id}
          onChange={setSelectedId}
          width="100%"
        />
        {documentId && (
          <DocumentFileExport
            documentId={documentId}
            file={selected}
            hasDraft={hasDraft}
          />
        )}
      </div>
      <HtmlViewer
        key={`${selected.id}:${selected.format}`}
        html={html}
        title={`${title} · ${selected.name}`}
        allowInteractivity={selected.format === "html"}
      />
    </div>
  );
}
