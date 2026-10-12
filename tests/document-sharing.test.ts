// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentSharingSettings } from "../src/components/document-sharing";

let root: Root;
let container: HTMLDivElement;
const requests: { path: string; method: string; body: unknown }[] = [];
let state = { path: null as string | null, version: 1 };
let conflict = false;
function button(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state = { path: null, version: 1 };
  conflict = false;
  requests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body: unknown = JSON.parse(String(init.body));
        requests.push({ path, method: "PUT", body });
        if (conflict)
          return Response.json(
            {
              error: {
                code: "SHARING_CONFLICT",
                message: "Delningen har ändrats.",
              },
            },
            { status: 409 },
          );
        state = {
          path: state.path ? null : `/shared/${"a".repeat(43)}`,
          version: state.version + 1,
        };
      }
      return Response.json(state);
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("owner sharing controls", () => {
  it("explains scope before publishing and shows the saved link, then confirms revocation", async () => {
    await act(async () =>
      root.render(
        createElement(DocumentSharingSettings, { documentId: "plan" }),
      ),
    );
    expect(container.textContent).toContain("Planeringen delas inte publikt");
    await click("Aktivera publik delning");
    expect(document.body.textContent).toContain(
      "Andra planeringar i projektet förblir privata",
    );
    expect(requests).toEqual([]);
    await click("Aktivera delning");
    expect(requests[0]).toEqual({
      path: "/api/documents/plan/sharing",
      method: "PUT",
      body: { action: "enable", expectedVersion: 1 },
    });
    expect(document.querySelector("input")?.readOnly).toBe(true);
    expect(document.querySelector("input")?.value).toContain(state.path);
    expect(container.textContent).toContain("Alla med länken kan läsa");
    await click("Stäng av delning");
    expect(document.body.textContent).toContain(
      "Redan visat eller sparat innehåll kan inte tas tillbaka",
    );
    const confirm = [...document.querySelectorAll("dialog button")].find(
      (element) => element.textContent?.trim() === "Stäng av delning",
    );
    expect(confirm).toBeTruthy();
    await act(async () => {
      if (confirm instanceof HTMLButtonElement) confirm.click();
    });
    expect(requests[1].body).toEqual({ action: "disable", expectedVersion: 2 });
    expect(container.textContent).toContain("Planeringen delas inte publikt");
    expect(document.querySelector("input")).toBeNull();
  });
  it("requires reviewing refreshed state after a conflict, without automatic retry", async () => {
    await act(async () =>
      root.render(
        createElement(DocumentSharingSettings, { documentId: "plan" }),
      ),
    );
    await click("Aktivera publik delning");
    conflict = true;
    await click("Aktivera delning");
    expect(requests).toHaveLength(1);
    expect(button("Aktivera publik delning").disabled).toBe(true);
    state = { path: `/shared/${"b".repeat(43)}`, version: 3 };
    conflict = false;
    await click("Hämta aktuell delning");
    expect(requests).toHaveLength(1);
    expect(document.querySelector("input")?.value).toContain(state.path);
    expect(button("Stäng av delning").disabled).toBe(false);
  });
});
