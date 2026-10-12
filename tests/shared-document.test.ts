// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sharedDocumentSchema, type SharedDocument } from "../src/contracts";
import { SharedDocumentView } from "../src/components/shared-document";

// Exercise the real public view, Astryx controls and CanvasViewer. The native
// drawing surface has its own SDK lifecycle tests in canvas-surface.test.ts.
vi.mock("next/dynamic", () => ({ default: () => () => null }));

const plan = sharedDocumentSchema.parse({
  id: "123e4567-e89b-42d3-a456-426614174000",
  title: "Extern granskning",
  description: "Planering med skiss",
  status: "active",
  updatedAt: "2026-10-12T10:00:00.000Z",
  files: [
    {
      id: "223e4567-e89b-42d3-a456-426614174000",
      name: "plan.html",
      format: "html",
      content: "<h1>Planering</h1>",
    },
    {
      id: "323e4567-e89b-42d3-a456-426614174000",
      name: "anteckningar.md",
      format: "markdown",
      content: "# Anteckningar",
    },
  ],
  canvas: {
    schemaVersion: 1,
    title: "Flödesskiss",
    shapes: [
      { id: "start", type: "rectangle", text: "Start", x: 0, y: 0 },
      { id: "end", type: "rectangle", text: "Granskning", x: 400, y: 0 },
      { id: "arrow", type: "arrow", startId: "start", endId: "end" },
    ],
  },
});
let root: Root;
let container: HTMLDivElement;

function control(label: string): HTMLElement {
  const match = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((element) => {
    const content = element.cloneNode(true);
    if (!(content instanceof HTMLElement)) return false;
    content
      .querySelectorAll('[aria-hidden="true"]')
      .forEach((node) => node.remove());
    return content.textContent?.trim() === label;
  });
  if (!match) throw new Error(`Missing control: ${label}`);
  return match;
}
async function click(label: string) {
  await act(async () => control(label).click());
}
function panel(label: string): HTMLElement {
  const tab = control(label);
  const element = document.getElementById(tab.getAttribute("aria-controls")!);
  if (!element) throw new Error(`Missing panel: ${label}`);
  expect(element.getAttribute("role")).toBe("tabpanel");
  expect(element.getAttribute("aria-labelledby")).toBe(tab.id);
  return element;
}
async function render(value: SharedDocument) {
  await act(async () =>
    root.render(createElement(SharedDocumentView, { document: value })),
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("public sketch navigation", () => {
  it("opens the saved sketch and fullscreen view without writes or losing the file preview", async () => {
    await render(plan);
    expect(control("Planering").getAttribute("aria-selected")).toBe("true");
    expect(panel("Planering").hidden).toBe(false);
    expect(panel("Visualisering").hidden).toBe(true);
    expect(container.textContent).not.toContain("Flödesskiss");
    const selector = container.querySelector<HTMLElement>(
      '[aria-haspopup="listbox"]',
    );
    if (!selector) throw new Error("Missing file selector");
    await act(async () => selector.click());
    const file = [
      ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((element) => element.textContent?.includes("anteckningar.md"));
    if (!file) throw new Error("Missing Markdown file option");
    await act(async () => file.click());
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe("");
    expect(frame?.title).toContain("anteckningar.md");

    await click("Visualisering");
    expect(control("Visualisering").getAttribute("aria-selected")).toBe("true");
    expect(panel("Planering").hidden).toBe(true);
    expect(panel("Visualisering").hidden).toBe(false);
    expect(panel("Visualisering").textContent).toContain("Flödesskiss");
    expect(panel("Visualisering").textContent).toContain("Start → Granskning");
    expect(container.querySelector("textarea")).toBeNull();

    await click("Expandera diagrammet");
    expect(document.querySelector("dialog[open]")?.textContent).toContain(
      "Flödesskiss",
    );
    await click("Återgå till planen");
    await click("Planering");
    expect(panel("Planering").hidden).toBe(false);
    expect(container.querySelector("iframe")).toBe(frame);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("explains a missing sketch and lets the visitor return to the planning files", async () => {
    await render({ ...plan, canvas: null });
    await click("Visualisering");
    expect(panel("Visualisering").textContent).toContain(
      "Ingen visualisering ännu",
    );
    expect(panel("Visualisering").textContent).toContain("ingen sparad skiss");
    expect(panel("Visualisering").querySelector("textarea")).toBeNull();
    await click("Visa planeringen");
    expect(control("Planering").getAttribute("aria-selected")).toBe("true");
    expect(panel("Planering").hidden).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
