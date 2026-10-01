import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { canvasConnector, type Canvas, type CanvasNode } from "../canvas";

// Diagram ink/fills belong to the SDK surface; application controls use Astryx.
const colors: Record<CanvasNode["color"], { ink: string; fill: string }> = {
  neutral: { ink: "#495057", fill: "#f1f3f5" },
  blue: { ink: "#1971c2", fill: "#d0ebff" },
  green: { ink: "#2b8a3e", fill: "#d3f9d8" },
  orange: { ink: "#e8590c", fill: "#ffe8cc" },
  red: { ink: "#c92a2a", fill: "#ffe3e3" },
  violet: { ink: "#6741d9", fill: "#e5dbff" },
};

/** Adapt the persisted contract to the pinned SDK's programmatic element API. */
export function canvasShapes(canvas: Canvas): ExcalidrawElementSkeleton[] {
  const nodes = new Map(
    canvas.shapes
      .filter((shape): shape is CanvasNode => shape.type !== "arrow")
      .map((shape) => [shape.id, shape]),
  );
  const arrows: ExcalidrawElementSkeleton[] = [];
  const boxes: ExcalidrawElementSkeleton[] = [];
  for (const shape of canvas.shapes) {
    const { ink, fill } = colors[shape.color];
    const style = {
      id: shape.id,
      strokeColor: ink,
      strokeWidth: 2,
      roughness: 0,
      seed: 1,
      locked: true,
    };
    // ':' cannot occur in persisted IDs, so labels cannot collide with AI nodes.
    const label = shape.text
      ? {
          id: `label:${shape.id}`,
          text: shape.text,
          fontFamily: 6, // Nunito, self-hosted from the pinned SDK.
          fontSize: 18,
          textAlign: "center" as const,
          verticalAlign: "middle" as const,
          strokeColor: "#212529",
        }
      : undefined;
    if (shape.type === "arrow") {
      const start = nodes.get(shape.startId);
      const end = nodes.get(shape.endId);
      if (!start || !end) throw new Error("Invalid canvas connector");
      const points = canvasConnector(start, end);
      arrows.push({
        ...style,
        type: "arrow",
        x: points.start.x,
        y: points.start.y,
        points: [
          [0, 0],
          [points.end.x - points.start.x, points.end.y - points.start.y],
        ],
        endArrowhead: "arrow",
        startArrowhead: null,
        start: { id: shape.startId },
        end: { id: shape.endId },
        label,
      });
    } else if (shape.type === "text") {
      boxes.push({
        ...style,
        type: "text",
        x: shape.x,
        y: shape.y,
        text: shape.text,
        width: shape.width,
        fontFamily: 6,
        fontSize: 18,
        autoResize: false,
      });
    } else {
      boxes.push({
        ...style,
        type: shape.type === "note" ? "rectangle" : shape.type,
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        backgroundColor: fill,
        fillStyle: "solid",
        roundness:
          shape.type === "rectangle" || shape.type === "note"
            ? { type: 3, value: 16 }
            : null,
        label,
      });
    }
  }
  // AI owns node movement; connector geometry is rebuilt for each saved scene.
  return [...arrows, ...boxes];
}
