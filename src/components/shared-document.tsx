"use client";

import { useId, useState } from "react";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Button } from "@astryxdesign/core/Button";
import { Eye, Sparkles } from "lucide-react";
import type { SharedDocument } from "@/contracts";
import { formatDate } from "@/client/document-format";
import { DocumentStatusBadge } from "./document-status";
import { PlanningFileViewer } from "./planning-file-viewer";
import { CanvasViewer } from "./canvas-viewer";

export function SharedDocumentView({ document }: { document: SharedDocument }) {
  const [tab, setTab] = useState("preview");
  const id = useId();
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
      <TabList
        value={tab}
        onChange={setTab}
        role="tablist"
        aria-label="Planeringens vyer"
        hasDivider
        size="lg"
      >
        <Tab
          id={`${id}-tab-preview`}
          value="preview"
          label="Planering"
          icon={<Eye size={16} aria-hidden />}
          panelId={`${id}-panel-preview`}
        />
        <Tab
          id={`${id}-tab-canvas`}
          value="canvas"
          label="Visualisering"
          icon={<Sparkles size={16} aria-hidden />}
          panelId={`${id}-panel-canvas`}
        />
      </TabList>
      <section
        hidden={tab !== "preview"}
        role="tabpanel"
        id={`${id}-panel-preview`}
        aria-labelledby={`${id}-tab-preview`}
        tabIndex={0}
      >
        <PlanningFileViewer files={document.files} title={document.title} />
      </section>
      <section
        hidden={tab !== "canvas"}
        role="tabpanel"
        id={`${id}-panel-canvas`}
        aria-labelledby={`${id}-tab-canvas`}
        tabIndex={0}
      >
        {tab === "canvas" &&
          (document.canvas ? (
            <div className="page-stack">
              <h2>Skisser och diagram</h2>
              <CanvasViewer canvas={document.canvas} />
            </div>
          ) : (
            <EmptyState
              title="Ingen visualisering ännu"
              description="Det finns ingen sparad skiss eller något diagram i den här planeringen. Du kan fortfarande läsa planeringsfilerna."
              headingLevel={2}
              icon={<Sparkles aria-hidden />}
              actions={
                <Button
                  label="Visa planeringen"
                  onClick={() => setTab("preview")}
                />
              }
            />
          ))}
      </section>
    </article>
  );
}
