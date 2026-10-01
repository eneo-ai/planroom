import { z } from "zod";

// This is Planroom's portable diagram contract, not a tldraw store snapshot.
// Only text and known geometry enter the application DOM. No HTML, URLs or assets.
export const maxCanvasShapes = 300;
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const text = z
  .string()
  .max(4000)
  .refine(
    (value) => value.isWellFormed() && !value.includes("\0"),
    "Text must be valid Unicode without NUL characters.",
  );
export const canvasColorSchema = z.enum([
  "neutral",
  "blue",
  "green",
  "orange",
  "red",
  "violet",
]);
const common = { id, color: canvasColorSchema.default("neutral") };
export const canvasNodeSchema = z.strictObject({
  ...common,
  type: z.enum(["rectangle", "ellipse", "diamond", "note", "text"]),
  text,
  x: z.number().finite().min(-20000).max(20000),
  y: z.number().finite().min(-20000).max(20000),
  width: z.number().finite().min(80).max(2000).default(240),
  height: z.number().finite().min(60).max(2000).default(120),
});
export const canvasArrowSchema = z.strictObject({
  ...common,
  type: z.literal("arrow"),
  startId: id,
  endId: id,
  text: text.default(""),
});
export const canvasShapeSchema = z.union([canvasNodeSchema, canvasArrowSchema]);
export const canvasSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    title: text.min(1).max(200),
    shapes: z.array(canvasShapeSchema).max(maxCanvasShapes),
  })
  .superRefine((canvas, context) => {
    const ids = new Set<string>();
    const nodes = new Set(
      canvas.shapes
        .filter((shape) => shape.type !== "arrow")
        .map((shape) => shape.id),
    );
    let textLength = 0;
    canvas.shapes.forEach((shape, index) => {
      if (ids.has(shape.id))
        context.addIssue({
          code: "custom",
          path: ["shapes", index, "id"],
          message: "Shape ids must be unique.",
        });
      ids.add(shape.id);
      textLength += shape.text.length;
      if (
        shape.type === "arrow" &&
        (!nodes.has(shape.startId) ||
          !nodes.has(shape.endId) ||
          shape.startId === shape.endId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["shapes", index],
          message: "Arrows must connect two different existing nodes.",
        });
      }
    });
    if (textLength > 100000)
      context.addIssue({
        code: "custom",
        path: ["shapes"],
        message: "Canvas text is limited to 100000 characters.",
      });
  });
export const canvasOperationSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("upsert"), shape: canvasShapeSchema }),
  z.strictObject({ action: z.literal("remove"), id }),
  z.strictObject({ action: z.literal("rename"), title: text.min(1).max(200) }),
]);
export type Canvas = z.infer<typeof canvasSchema>;
export type CanvasNode = z.infer<typeof canvasNodeSchema>;
export type CanvasShape = z.infer<typeof canvasShapeSchema>;
export type CanvasOperation = z.infer<typeof canvasOperationSchema>;

export class CanvasOperationError extends Error {}

/** Apply one bounded, atomic batch. Removing a node also removes its arrows. */
export function applyCanvasOperations(
  current: Canvas | null,
  title: string,
  operations: CanvasOperation[],
): Canvas {
  const shapes = new Map(
    (current?.shapes ?? []).map((shape) => [shape.id, shape]),
  );
  let nextTitle = current?.title ?? title;
  for (const operation of operations) {
    if (operation.action === "rename") nextTitle = operation.title;
    else if (operation.action === "upsert")
      shapes.set(operation.shape.id, operation.shape);
    else {
      if (!shapes.delete(operation.id))
        throw new CanvasOperationError(
          `Shape ${operation.id} does not exist. Read the canvas before changing it.`,
        );
      for (const [key, shape] of shapes) {
        if (
          shape.type === "arrow" &&
          (shape.startId === operation.id || shape.endId === operation.id)
        )
          shapes.delete(key);
      }
    }
  }
  const parsed = canvasSchema.safeParse({
    schemaVersion: 1,
    title: nextTitle,
    shapes: [...shapes.values()],
  });
  if (!parsed.success)
    throw new CanvasOperationError(
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  return parsed.data;
}

/** Deterministic connector geometry, shared by rendering and geometry tests. */
export function canvasConnector(start: CanvasNode, end: CanvasNode) {
  const center = (node: CanvasNode) => ({
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  });
  const a = center(start);
  const b = center(end);
  const boundary = (node: CanvasNode, from: typeof a, toward: typeof a) => {
    const dx = toward.x - from.x;
    const dy = toward.y - from.y;
    if (dx === 0 && dy === 0) return from;
    const rx = node.width / 2;
    const ry = node.height / 2;
    const scale =
      node.type === "ellipse"
        ? 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
        : node.type === "diamond"
          ? 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry)
          : Math.min(
              dx === 0 ? Infinity : rx / Math.abs(dx),
              dy === 0 ? Infinity : ry / Math.abs(dy),
            );
    return { x: from.x + dx * scale, y: from.y + dy * scale };
  };
  return { start: boundary(start, a, b), end: boundary(end, b, a) };
}
