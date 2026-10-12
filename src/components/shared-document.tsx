"use client";

import type { SharedDocument } from "@/contracts";
import { formatDate } from "@/client/document-format";
import { DocumentStatusBadge } from "./document-status";
import { PlanningFileViewer } from "./planning-file-viewer";
import { CanvasViewer } from "./canvas-viewer";

export function SharedDocumentView({ document }: { document: SharedDocument }) {
  return (
    <article className="page-stack">
      <header className="page-heading">
        <div>
          <DocumentStatusBadge status={document.status} />
          <h1>{document.title}</h1>
          <p className="muted">{document.description}</p>
          <p className="fine-print">
            Uppdaterad{" "}
            <time dateTime={document.updatedAt}>
              {formatDate(document.updatedAt)}
            </time>{" "}
            · Endast läsning
          </p>
        </div>
      </header>
      <PlanningFileViewer files={document.files} title={document.title} />
      {document.canvas && (
        <section className="page-stack">
          <h2>Diagram</h2>
          <CanvasViewer canvas={document.canvas} />
        </section>
      )}
    </article>
  );
}
