"use client";

import dynamic from "next/dynamic";
import { Component, useState, type ReactNode } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Expand, Minimize } from "lucide-react";
import type { Canvas } from "@/canvas";
import styles from "./document-canvas.module.css";

const CanvasSurface = dynamic(
  () => {
    // Configure local fonts before evaluating the browser-only SDK module.
    Object.assign(window, { EXCALIDRAW_ASSET_PATH: "/excalidraw/" });
    return import("./canvas-surface");
  },
  {
    ssr: false,
    loading: () => <p role="status">Öppnar visualiseringen…</p>,
  },
);

class CanvasBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Banner
        status="error"
        title="Diagramvyn kunde inte öppnas"
        description="Innehållet finns kvar. Läs textversionen nedan eller ladda om sidan för att försöka igen."
      />
    ) : (
      this.props.children
    );
  }
}

export function CanvasViewer({ canvas }: { canvas: Canvas }) {
  const [expanded, setExpanded] = useState(false);
  const surface = (
    <CanvasBoundary>
      <CanvasSurface canvas={canvas} />
    </CanvasBoundary>
  );
  const nodes = new Map(
    canvas.shapes
      .filter((shape) => shape.type !== "arrow")
      .map((shape) => [shape.id, shape]),
  );
  return (
    <div className={styles.root}>
      <div className={styles.heading}>
        <div className={styles.headingText}>
          <h3>{canvas.title}</h3>
          <p className="fine-print">
            {canvas.shapes.length} objekt · AI skapar och ändrar diagrammet · Du
            kan zooma och utforska
          </p>
        </div>
        <Button
          label="Expandera diagrammet"
          icon={<Expand size={16} aria-hidden />}
          onClick={() => setExpanded(true)}
        />
      </div>
      <Card padding={0}>{!expanded && surface}</Card>
      <details className={styles.textView}>
        <summary>Visa diagrammets innehåll som text</summary>
        <ul>
          {canvas.shapes.map((shape) => (
            <li key={shape.id}>
              {shape.type === "arrow"
                ? `${nodes.get(shape.startId)?.text || shape.startId} → ${nodes.get(shape.endId)?.text || shape.endId}${shape.text ? `: ${shape.text}` : ""}`
                : shape.text || `Objekt ${shape.id}`}
            </li>
          ))}
        </ul>
      </details>
      <Dialog
        isOpen={expanded}
        onOpenChange={setExpanded}
        variant="fullscreen"
        purpose="info"
      >
        <div className={styles.expanded}>
          <DialogHeader
            title={canvas.title}
            endContent={
              <Button
                label="Återgå till planen"
                icon={<Minimize size={16} aria-hidden />}
                onClick={() => setExpanded(false)}
              />
            }
          />
          {expanded && surface}
        </div>
      </Dialog>
    </div>
  );
}
