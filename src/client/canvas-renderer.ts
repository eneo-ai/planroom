import {
  createShapeId,
  toRichText,
  type Editor,
  type TLShapePartial,
  type TLDefaultColorStyle,
} from "tldraw";
import { canvasConnector, type Canvas, type CanvasNode } from "../canvas";

const colors: Record<CanvasNode["color"], TLDefaultColorStyle> = {
  neutral: "black",
  blue: "blue",
  green: "green",
  orange: "orange",
  red: "red",
  violet: "violet",
};

export function canvasShapes(canvas: Canvas): TLShapePartial[] {
  const nodes = new Map(
    canvas.shapes
      .filter((shape): shape is CanvasNode => shape.type !== "arrow")
      .map((shape) => [shape.id, shape]),
  );
  const arrows: TLShapePartial[] = [];
  const boxes: TLShapePartial[] = [];
  for (const shape of canvas.shapes) {
    const id = createShapeId(shape.id);
    const color = colors[shape.color];
    if (shape.type === "arrow") {
      const start = nodes.get(shape.startId);
      const end = nodes.get(shape.endId);
      if (!start || !end) throw new Error("Invalid canvas connector");
      const points = canvasConnector(start, end);
      arrows.push({
        id,
        type: "arrow",
        x: 0,
        y: 0,
        props: {
          start: points.start,
          end: points.end,
          color,
          labelColor: color,
          richText: toRichText(shape.text),
          font: "sans",
          size: "s",
          dash: "solid",
          arrowheadEnd: "arrow",
        },
      });
    } else if (shape.type === "text") {
      boxes.push({
        id,
        type: "text",
        x: shape.x,
        y: shape.y,
        props: {
          richText: toRichText(shape.text),
          color,
          font: "sans",
          size: "s",
          w: shape.width,
          autoSize: false,
        },
      });
    } else {
      boxes.push({
        id,
        type: "geo",
        x: shape.x,
        y: shape.y,
        props: {
          geo: shape.type === "note" ? "rectangle" : shape.type,
          w: shape.width,
          h: shape.height,
          richText: toRichText(shape.text),
          color,
          labelColor: "black",
          fill: "semi",
          font: "sans",
          size: "s",
          dash: "solid",
          align: "middle",
          verticalAlign: "middle",
        },
      });
    }
  }
  // Connectors sit underneath nodes, with endpoints at each node boundary.
  return [...arrows, ...boxes];
}

export function renderCanvas(editor: Editor, canvas: Canvas, fit: boolean) {
  editor.run(
    () => {
      const readonly = editor.getIsReadonly();
      editor.updateInstanceState({ isReadonly: false });
      try {
        editor.deleteShapes([...editor.getCurrentPageShapeIds()]);
        editor.createShapes(canvasShapes(canvas));
      } finally {
        editor.updateInstanceState({ isReadonly: readonly });
      }
    },
    { history: "ignore", ignoreShapeLock: true },
  );
  if (fit) editor.zoomToFit({ animation: { duration: 0 } });
}
