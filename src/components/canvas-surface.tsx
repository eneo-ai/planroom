"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  convertToExcalidrawElements,
  exportToBlob,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Button } from "@astryxdesign/core/Button";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Banner } from "@astryxdesign/core/Banner";
import { ZoomIn, ZoomOut, Scan, Download } from "lucide-react";
import type { Canvas } from "@/canvas";
import { canvasShapes } from "@/client/canvas-renderer";
import { errorMessage } from "@/client/api";
import "@excalidraw/excalidraw/index.css";
import styles from "./document-canvas.module.css";

export default function CanvasSurface({ canvas }: { canvas: Canvas }) {
  const [editor, setEditor] = useState<ExcalidrawImperativeAPI | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const rendered = useRef(false);
  const elements = useMemo(
    () =>
      convertToExcalidrawElements(canvasShapes(canvas), {
        regenerateIds: false,
      }),
    [canvas],
  );
  // The SDK initializes asynchronously after exposing its API. Supplying the
  // scene here prevents initialization from replacing an early update with []:
  // API availability alone does not mean the editor has loaded its scene.
  const [initialData] = useState(() => ({ elements, scrollToContent: true }));

  useEffect(() => {
    if (!editor || !initialized) return;
    try {
      editor.updateScene({
        elements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      editor.setActiveTool({ type: "hand" });
      if (!rendered.current) {
        editor.scrollToContent(elements, {
          fitToContent: true,
          animate: false,
        });
      }
      rendered.current = true;
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [editor, initialized, elements]);

  function zoom(factor: number) {
    if (!editor) return;
    const state = editor.getAppState();
    const previous = state.zoom.value;
    const next = Math.min(8, Math.max(0.1, previous * factor));
    editor.updateScene({
      appState: {
        zoom: { value: next as AppState["zoom"]["value"] },
        scrollX:
          state.scrollX +
          state.width / (2 * next) -
          state.width / (2 * previous),
        scrollY:
          state.scrollY +
          state.height / (2 * next) -
          state.height / (2 * previous),
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  async function download() {
    if (!editor || exporting) return;
    setExporting(true);
    setError("");
    let url: string | undefined;
    try {
      const blob = await exportToBlob({
        elements: editor.getSceneElements(),
        appState: { ...editor.getAppState(), exportBackground: true },
        files: null,
        mimeType: "image/png",
        getDimensions: (width: number, height: number) => {
          const scale = Math.min(1, 4000 / Math.max(width, height));
          return {
            width: Math.ceil(width * scale),
            height: Math.ceil(height * scale),
            scale,
          };
        },
      });
      url = URL.createObjectURL(blob);
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
            Dra för att panorera · Använd knapparna för att zooma
          </span>
        }
        endContent={
          <>
            <IconButton
              label="Zooma ut"
              tooltip="Zooma ut"
              icon={<ZoomOut size={16} aria-hidden />}
              onClick={() => zoom(1 / 1.2)}
              isDisabled={!editor}
            />
            <IconButton
              label="Zooma in"
              tooltip="Zooma in"
              icon={<ZoomIn size={16} aria-hidden />}
              onClick={() => zoom(1.2)}
              isDisabled={!editor}
            />
            <Button
              label="Visa hela diagrammet"
              icon={<Scan size={16} aria-hidden />}
              onClick={() =>
                editor?.scrollToContent(undefined, { fitToContent: true })
              }
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
      <div
        className={styles.stage}
        aria-label={`Diagram: ${canvas.title}`}
        onContextMenuCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDropCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <Excalidraw
          excalidrawAPI={setEditor}
          initialData={initialData}
          onChange={(_elements, state) => {
            if (!state.isLoading) setInitialized(true);
          }}
          viewModeEnabled
          zenModeEnabled
          theme="light"
          langCode="sv-SE"
          name={canvas.title}
          aiEnabled={false}
          autoFocus={false}
          handleKeyboardGlobally={false}
          validateEmbeddable={false}
          onPaste={() => false}
          UIOptions={{
            canvasActions: {
              clearCanvas: false,
              loadScene: false,
              saveToActiveFile: false,
              export: false,
              saveAsImage: false,
              changeViewBackgroundColor: false,
              toggleTheme: false,
            },
            tools: { image: false },
          }}
        />
      </div>
    </div>
  );
}
