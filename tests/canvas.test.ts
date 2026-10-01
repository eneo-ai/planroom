import { describe, expect, it } from "vitest";
import {
  applyCanvasOperations,
  canvasSchema,
  canvasConnector,
  canvasNodeSchema,
  type CanvasOperation,
} from "../src/canvas";
import { updateCanvasSchema } from "../src/contracts";
import { canvasPrompt } from "../src/canvas-prompt";

const node = canvasNodeSchema.parse({
  id: "source",
  type: "rectangle",
  text: "Ansökan",
  x: 0,
  y: 0,
});
const second = {
  ...node,
  id: "decision",
  type: "diamond" as const,
  x: 400,
  text: "Komplett?",
};
const operations: CanvasOperation[] = [
  { action: "upsert", shape: node },
  { action: "upsert", shape: second },
  {
    action: "upsert",
    shape: {
      id: "flow",
      type: "arrow",
      startId: node.id,
      endId: second.id,
      text: "Kontrollera",
      color: "blue",
    },
  },
];
describe("portable AI canvas behavior", () => {
  it("creates a diagram and refines only the requested objects without mutating the original", () => {
    const original = applyCanvasOperations(null, "Process", operations);
    const updated = applyCanvasOperations(original, "Ignored", [
      { action: "upsert", shape: { ...second, text: "Alla fält ifyllda?" } },
    ]);
    expect(original.shapes[1].text).toBe("Komplett?");
    expect(updated.shapes).toHaveLength(3);
    expect(updated.shapes[0]).toEqual(node);
    expect(updated.shapes[1].text).toBe("Alla fält ifyllda?");
    expect(updated.shapes[2]).toEqual(original.shapes[2]);
    expect(updated.title).toBe("Process");
  });
  it("removes incident arrows with their node and leaves unrelated content intact", () => {
    const original = applyCanvasOperations(null, "Process", operations);
    expect(
      applyCanvasOperations(original, "Process", [
        { action: "remove", id: second.id },
      ]).shapes,
    ).toEqual([node]);
    expect(original.shapes).toHaveLength(3);
  });
  it("rejects dangling connectors and missing removals without changing the existing scene", () => {
    const original = applyCanvasOperations(null, "Process", operations);
    expect(() =>
      applyCanvasOperations(original, "Process", [
        { action: "upsert", shape: { ...node, id: "decision", type: "text" } },
        { action: "remove", id: "unknown" },
      ]),
    ).toThrow(/does not exist/);
    expect(() =>
      applyCanvasOperations(null, "Process", operations.slice(2)),
    ).toThrow(/existing nodes/);
    expect(original.shapes).toHaveLength(3);
  });
  it("permits connectors before their nodes within the same atomic batch", () => {
    expect(
      applyCanvasOperations(null, "Process", [...operations].reverse()).shapes,
    ).toHaveLength(3);
  });
  it("rejects duplicate ids, self references, oversized diagrams, invalid text and active content", () => {
    const canvas = applyCanvasOperations(null, "Process", operations);
    expect(
      canvasSchema.safeParse({ ...canvas, shapes: [node, node] }).success,
    ).toBe(false);
    expect(
      canvasSchema.safeParse({
        ...canvas,
        shapes: [node, { ...canvas.shapes[2], endId: node.id }],
      }).success,
    ).toBe(false);
    expect(
      canvasSchema.safeParse({
        ...canvas,
        shapes: Array.from({ length: 301 }, (_, index) => ({
          ...node,
          id: `n${index}`,
        })),
      }).success,
    ).toBe(false);
    for (const extra of [
      { html: "<script>alert(1)</script>" },
      { url: "https://example.test" },
      { type: "embed" },
      { text: "\0" },
      { text: "\ud800" },
      { x: Infinity },
      { width: -1 },
    ]) {
      expect(canvasNodeSchema.safeParse({ ...node, ...extra }).success).toBe(
        false,
      );
    }
    expect(
      canvasNodeSchema.parse({ ...node, text: "<script>alert(1)</script>" })
        .text,
    ).toBe("<script>alert(1)</script>");
  });
  it("requires a current document version and bounded operations", () => {
    expect(
      updateCanvasSchema.safeParse({ changeSummary: "Draw", operations })
        .success,
    ).toBe(false);
    expect(
      updateCanvasSchema.safeParse({
        expectedVersion: 1,
        changeSummary: "Draw",
        operations: [],
      }).success,
    ).toBe(false);
    expect(
      updateCanvasSchema.parse({
        expectedVersion: 1,
        changeSummary: "Draw",
        operations,
      }).operations,
    ).toHaveLength(3);
  });
  it("connects rectangle, ellipse and diamond boundaries rather than their centers", () => {
    expect(canvasConnector(node, second)).toEqual({
      start: { x: 240, y: 60 },
      end: { x: 400, y: 60 },
    });
    const ellipse = { ...second, type: "ellipse" as const, x: 0, y: 300 };
    expect(canvasConnector(node, ellipse)).toEqual({
      start: { x: 120, y: 120 },
      end: { x: 120, y: 300 },
    });
    const coincident = canvasConnector(node, { ...node, id: "other" });
    expect(Number.isFinite(coincident.start.x)).toBe(true);
  });
  it("gives the UI and MCP the same revision-safe drawing workflow", () => {
    const prompt = canvasPrompt("document-id", "  Visa arkitekturen  ");
    expect(prompt).toContain("document-id");
    expect(prompt).toContain("Visa arkitekturen");
    expect(prompt).toContain("read_document");
    expect(prompt).toContain("apply_canvas_operations");
    expect(prompt).toContain("DOCUMENT_CONFLICT");
  });
});
