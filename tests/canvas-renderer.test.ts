// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  convertToExcalidrawElements,
  setCustomTextMetricsProvider,
} from "@excalidraw/excalidraw";
import { canvasConnector, canvasSchema } from "../src/canvas";
import { canvasShapes } from "../src/client/canvas-renderer";

vi.hoisted(() => {
  // happy-dom has no native 2D context. SDK import probes filter support;
  // conversion uses the explicit text-metrics provider below instead.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    filter: "none",
  } as CanvasRenderingContext2D);
});

// The SDK's supported provider lets native conversion run without a browser's
// font/canvas service. These tests verify scene semantics, not font appearance.
beforeAll(() => {
  vi.stubGlobal(
    "FontFace",
    class {
      readonly unicodeRange: string;
      constructor(
        readonly family: string,
        _source: string,
        descriptors: FontFaceDescriptors = {},
      ) {
        this.unicodeRange = descriptors.unicodeRange ?? "U+0-10FFFF";
      }
    },
  );
  setCustomTextMetricsProvider({
    getLineWidth: (text, font) => text.length * Number.parseFloat(font) * 0.5,
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("native Excalidraw diagram contract", () => {
  it("converts every saved shape and preserves literal markup and stable IDs", () => {
    const canvas = canvasSchema.parse({
      schemaVersion: 1,
      title: "Architecture",
      shapes: [
        {
          id: "source",
          type: "rectangle",
          x: 0,
          y: 0,
          text: "<script>alert(1)</script>",
        },
        { id: "decision", type: "diamond", x: 400, y: 0, text: "Proceed?" },
        { id: "destination", type: "ellipse", x: 800, y: 0, text: "Result" },
        { id: "note", type: "note", x: 0, y: 200, text: "Open question" },
        { id: "caption", type: "text", x: 0, y: -160, text: "Data flow" },
        {
          id: "arrow",
          type: "arrow",
          startId: "source",
          endId: "destination",
          text: "Payload",
        },
      ],
    });
    const scene = convertToExcalidrawElements(canvasShapes(canvas), {
      regenerateIds: false,
    });
    expect(scene[0].id).toBe("arrow");
    expect(new Set(scene.map((element) => element.id)).size).toBe(scene.length);
    for (const saved of canvas.shapes) {
      const native = scene.find((element) => element.id === saved.id);
      expect(native?.type).toBe(
        saved.type === "note" ? "rectangle" : saved.type,
      );
    }
    const label = scene.find((element) => element.id === "label:source");
    if (label?.type !== "text") throw new Error("Missing native text label");
    expect(label.originalText).toBe("<script>alert(1)</script>");
    expect(label.containerId).toBe("source");
    const arrowLabel = scene.find((element) => element.id === "label:arrow");
    if (arrowLabel?.type !== "text") throw new Error("Missing arrow label");
    expect(arrowLabel.originalText).toBe("Payload");
    expect(arrowLabel.containerId).toBe("arrow");
    expect(scene.every((element) => element.link === null)).toBe(true);
    expect(
      scene.every((element) =>
        ["rectangle", "ellipse", "diamond", "text", "arrow"].includes(
          element.type,
        ),
      ),
    ).toBe(true);
  });

  it.each([
    { x: 800, y: 200 },
    { x: -800, y: -200 },
  ])("keeps boundary endpoints when AI moves a node to $x,$y", ({ x, y }) => {
    const canvas = canvasSchema.parse({
      schemaVersion: 1,
      title: "Flow",
      shapes: [
        { id: "a", type: "rectangle", x: 0, y: 0, text: "A" },
        { id: "b", type: "rectangle", x: 400, y: 0, text: "B" },
        { id: "arrow", type: "arrow", startId: "a", endId: "b" },
      ],
    });
    const moved = canvasSchema.parse({
      ...canvas,
      shapes: canvas.shapes.map((shape) =>
        shape.id === "b" ? { ...shape, x, y } : shape,
      ),
    });
    const scene = convertToExcalidrawElements(canvasShapes(moved), {
      regenerateIds: false,
    });
    const arrow = scene.find((element) => element.id === "arrow");
    const [start, end] = moved.shapes;
    if (
      arrow?.type !== "arrow" ||
      start.type === "arrow" ||
      end.type === "arrow"
    ) {
      throw new Error("Missing native connector or nodes");
    }
    const expected = canvasConnector(start, end);
    expect(arrow.startBinding?.elementId).toBe("a");
    expect(arrow.endBinding?.elementId).toBe("b");
    // Native binding leaves a small stroke gap at the node boundary.
    expect(
      Math.abs(arrow.x + arrow.points[0][0] - expected.start.x),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(arrow.y + arrow.points[0][1] - expected.start.y),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(arrow.x + arrow.points[1][0] - expected.end.x),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(arrow.y + arrow.points[1][1] - expected.end.y),
    ).toBeLessThanOrEqual(2);
    expect(arrow.endArrowhead).toBe("arrow");
  });

  it("does not retain removed shapes or labels when converting the next revision", () => {
    const canvas = canvasSchema.parse({
      schemaVersion: 1,
      title: "Questions",
      shapes: [{ id: "note", type: "note", x: 0, y: 0, text: "Question" }],
    });
    const previous = convertToExcalidrawElements(canvasShapes(canvas), {
      regenerateIds: false,
    });
    const next = convertToExcalidrawElements(
      canvasShapes({ ...canvas, shapes: [] }),
      { regenerateIds: false },
    );
    expect(previous).toHaveLength(2);
    expect(next).toEqual([]);
  });
});
