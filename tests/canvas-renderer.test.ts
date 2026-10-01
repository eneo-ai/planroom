import { describe, expect, it } from "vitest";
import {
  ArrowShapeUtil,
  GeoShapeUtil,
  TextShapeUtil,
  createTLSchema,
} from "tldraw";
import { canvasSchema } from "../src/canvas";
import { canvasShapes } from "../src/client/canvas-renderer";

describe("native tldraw diagram contract", () => {
  it("produces valid SDK shapes and treats markup as literal rich text", () => {
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
    const schema = createTLSchema();
    const shapes = canvasShapes(canvas);
    const defaults = {
      geo: GeoShapeUtil.prototype.getDefaultProps(),
      arrow: ArrowShapeUtil.prototype.getDefaultProps(),
      text: TextShapeUtil.prototype.getDefaultProps(),
    };
    for (const shape of shapes) {
      if (
        shape.type !== "geo" &&
        shape.type !== "arrow" &&
        shape.type !== "text"
      )
        throw new Error("Unexpected native shape");
      expect(() =>
        schema.types.shape.validate({
          id: shape.id,
          typeName: "shape",
          type: shape.type,
          x: shape.x,
          y: shape.y,
          rotation: 0,
          index: "a1",
          parentId: "page:canvas",
          opacity: 1,
          isLocked: false,
          meta: {},
          props: { ...defaults[shape.type], ...shape.props },
        }),
      ).not.toThrow();
    }
    expect(shapes[0].type).toBe("arrow");
    const literal = shapes.find((shape) => shape.id === "shape:source");
    expect(JSON.stringify(literal?.props)).toContain(
      "<script>alert(1)</script>",
    );
    expect(literal?.props).not.toHaveProperty("html");
    expect(literal?.props).not.toHaveProperty("url");
  });
  it("repositions connectors when AI moves a node", () => {
    const canvas = canvasSchema.parse({
      schemaVersion: 1,
      title: "Flow",
      shapes: [
        { id: "a", type: "rectangle", x: 0, y: 0, text: "A" },
        { id: "b", type: "rectangle", x: 400, y: 0, text: "B" },
        { id: "arrow", type: "arrow", startId: "a", endId: "b" },
      ],
    });
    const before = canvasShapes(canvas)[0];
    const moved = canvasSchema.parse({
      ...canvas,
      shapes: canvas.shapes.map((shape) =>
        shape.id === "b" ? { ...shape, x: 800 } : shape,
      ),
    });
    expect(canvasShapes(moved)[0].props).not.toEqual(before.props);
    expect(canvasShapes(moved)[0].id).toBe(before.id);
  });
});
