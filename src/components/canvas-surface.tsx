"use client";

import { useEffect, useRef, useState } from "react";
import { Tldraw, type Editor } from "tldraw";
import { getAssetUrls } from "@tldraw/assets/selfHosted";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Button } from "@astryxdesign/core/Button";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Banner } from "@astryxdesign/core/Banner";
import { ZoomIn, ZoomOut, Scan, Download } from "lucide-react";
import type { Canvas } from "@/canvas";
import { renderCanvas } from "@/client/canvas-renderer";
import { errorMessage } from "@/client/api";
import "tldraw/tldraw.css";
import styles from "./document-canvas.module.css";

const components = {
  ErrorFallback: () => (
    <Banner
      status="error"
      title="Diagrammotorn kunde inte starta"
      description="Läs textversionen eller ladda om sidan. Kontrollera SDK-licensen i installationens konfiguration."
    />
  ),
  ShapeErrorFallback: () => (
    <span role="status">Objektet kunde inte visas</span>
  ),
};
const assetUrls = getAssetUrls({ baseUrl: "/tldraw/" });

export default function CanvasSurface({
  canvas,
  licenseKey,
}: {
  canvas: Canvas;
  licenseKey: string | null;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const rendered = useRef(false);
  useEffect(() => {
    if (!editor) return;
    try {
      renderCanvas(editor, canvas, !rendered.current);
      rendered.current = true;
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [editor, canvas]);

  async function download() {
    if (!editor || exporting) return;
    setExporting(true);
    setError("");
    let url: string | undefined;
    try {
      const bounds = editor.getCurrentPageBounds();
      const scale = bounds
        ? Math.min(1, 4000 / Math.max(bounds.width + 64, bounds.height + 64))
        : 1;
      const result = await editor.toImage(
        [...editor.getCurrentPageShapeIds()],
        { format: "png", scale, pixelRatio: 1, background: true },
      );
      url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "planroom-visualisering.png";
      link.click();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      if (url) URL.revokeObjectURL(url);
      setExporting(false);
    }
  }
  return (
    <div className={styles.surface}>
      <Toolbar
        label="Visualiseringens visningsverktyg"
        size="sm"
        startContent={
          <span className="fine-print">
            Dra för att panorera · Scrolla för att zooma
          </span>
        }
        endContent={
          <>
            <IconButton
              label="Zooma ut"
              icon={<ZoomOut size={16} aria-hidden />}
              onClick={() => editor?.zoomOut()}
              isDisabled={!editor}
            />
            <IconButton
              label="Zooma in"
              icon={<ZoomIn size={16} aria-hidden />}
              onClick={() => editor?.zoomIn()}
              isDisabled={!editor}
            />
            <Button
              label="Visa hela diagrammet"
              icon={<Scan size={16} aria-hidden />}
              onClick={() => editor?.zoomToFit()}
              isDisabled={!editor}
            />
            <Button
              label="Ladda ner PNG"
              icon={<Download size={16} aria-hidden />}
              onClick={() => void download()}
              isLoading={exporting}
              isDisabled={!editor || canvas.shapes.length === 0}
            />
          </>
        }
      />
      {error && (
        <Banner
          status="error"
          title="Visualiseringen kunde inte visas eller exporteras"
          description={error}
        />
      )}
      <div className={styles.stage} aria-label={`Diagram: ${canvas.title}`}>
        <Tldraw
          hideUi
          components={components}
          locale="sv"
          colorScheme="system"
          options={{ maxShapesPerPage: 300, maxPages: 1 }}
          assetUrls={assetUrls}
          licenseKey={licenseKey ?? undefined}
          autoFocus={false}
          onMount={(next) => {
            next.updateInstanceState({ isReadonly: true });
            next.setCurrentTool("hand");
            setEditor(next);
            return () => {
              rendered.current = false;
            };
          }}
        />
      </div>
    </div>
  );
}
