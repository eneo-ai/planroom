// @vitest-environment happy-dom
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { setCustomTextMetricsProvider } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import type { Canvas } from "../src/canvas";
import CanvasSurface from "../src/components/canvas-surface";

const observed = vi.hoisted(() => ({
  api: null as ExcalidrawImperativeAPI | null,
  fonts: Object.getOwnPropertyDescriptor(document, "fonts"),
}));

vi.hoisted(() => {
  // The SDK is real; only unavailable browser drawing/font services are shimmed.
  // Assert native scene state after initialization, rather than rendered pixels.
  const noop = () => {};
  const context: Partial<CanvasRenderingContext2D> = {
    filter: "none",
    save: noop,
    restore: noop,
    setTransform: noop,
    resetTransform: noop,
    scale: noop,
    translate: noop,
    rotate: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    bezierCurveTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    clip: noop,
    fill: noop,
    stroke: noop,
    setLineDash: noop,
    getLineDash: () => [],
    fillText: noop,
    strokeText: noop,
    drawImage: noop,
    measureText: (text) => ({ width: text.length * 9 }) as TextMetrics,
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return { ...context, canvas: this } as CanvasRenderingContext2D;
    },
  );
  vi.stubGlobal(
    "FontFace",
    class {
      readonly status = "loaded";
      readonly unicodeRange: string;
      constructor(
        readonly family: string,
        _source: string,
        descriptors: FontFaceDescriptors = {},
      ) {
        this.unicodeRange = descriptors.unicodeRange ?? "U+0-10FFFF";
      }
      load() {
        return Promise.resolve(this);
      }
    },
  );
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: Object.assign(new Set<FontFace>(), {
      check: () => true,
      load: () => Promise.resolve([]),
      ready: Promise.resolve(),
      addEventListener: noop,
      removeEventListener: noop,
    }),
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "Path2D",
    class {
      roundRect() {}
    },
  );
});

// Observe the public API while mounting the actual Excalidraw implementation.
vi.mock("@excalidraw/excalidraw", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@excalidraw/excalidraw")>();
  const { createElement: element } = await import("react");
  return {
    ...sdk,
    Excalidraw: (props: ExcalidrawProps) =>
      element(sdk.Excalidraw, {
        ...props,
        excalidrawAPI: (api: ExcalidrawImperativeAPI) => {
          observed.api = api;
          props.excalidrawAPI?.(api);
        },
      }),
  };
});

const canvas: Canvas = {
  schemaVersion: 1,
  title: "Saved diagram",
  shapes: [
    {
      id: "component",
      type: "rectangle",
      text: "The saved component",
      color: "blue",
      x: 100,
      y: 100,
      width: 400,
      height: 200,
    },
  ],
};
let root: Root | undefined;
let container: HTMLDivElement;

beforeAll(() => {
  setCustomTextMetricsProvider({
    getLineWidth: (text, font) => text.length * Number.parseFloat(font) * 0.5,
  });
});
afterAll(() => {
  if (observed.fonts) Object.defineProperty(document, "fonts", observed.fonts);
  else Reflect.deleteProperty(document, "fonts");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  observed.api = null;
});

async function mount(value: Canvas) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(createElement(CanvasSurface, { canvas: value })),
  );
  await vi.waitFor(() => {
    expect(observed.api?.getAppState().isLoading).toBe(false);
  });
  const api = observed.api;
  if (!api) throw new Error("Native SDK API was not exposed");
  return api;
}

describe("saved canvas lifecycle with the native SDK", () => {
  it("retains saved shapes after asynchronous initialization and remount", async () => {
    let api = await mount(canvas);
    expect(api.getSceneElements().map((element) => element.id)).toEqual([
      "component",
      "label:component",
    ]);
    await act(async () => root?.unmount());
    container.remove();
    root = undefined;
    observed.api = null;
    api = await mount(canvas);
    expect(
      api.getSceneElements().some((element) => element.id === "component"),
    ).toBe(true);
  });

  it("applies an AI update after initialization without resetting the camera", async () => {
    const api = await mount(canvas);
    await act(async () => {
      api.updateScene({ appState: { scrollX: 123, scrollY: 456 } });
    });
    const camera = api.getAppState();
    const updated: Canvas = {
      ...canvas,
      shapes: canvas.shapes.map((shape) => ({
        ...shape,
        text: "Updated by AI",
      })),
    };
    await act(async () =>
      root?.render(createElement(CanvasSurface, { canvas: updated })),
    );
    const label = api
      .getSceneElements()
      .find((element) => element.id === "label:component");
    expect(label?.type === "text" && label.originalText).toBe("Updated by AI");
    expect(api.getAppState().scrollX).toBe(camera.scrollX);
    expect(api.getAppState().scrollY).toBe(camera.scrollY);
    expect(api.getAppState().zoom).toEqual(camera.zoom);
  });
});
