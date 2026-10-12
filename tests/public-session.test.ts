// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "../src/components/session";

const navigation = vi.hoisted(() => ({
  path: "/shared/link",
  replace: vi.fn(),
  clearDrafts: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.path,
  useRouter: () => ({ replace: navigation.replace }),
}));
vi.mock("../src/components/document-drafts", () => ({
  useDocumentDrafts: () => ({ clearDrafts: navigation.clearDrafts }),
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  navigation.replace.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ user: null })),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () =>
    root.render(
      createElement(SessionProvider, {
        children: createElement("p", null, "Shared content"),
      }),
    ),
  );
}

describe("anonymous public navigation", () => {
  it.each(["/shared/link"])(
    "renders %s without redirecting to sign in",
    async (path) => {
      navigation.path = path;
      await render();
      expect(container.textContent).toContain("Shared content");
      expect(navigation.replace).not.toHaveBeenCalled();
    },
  );
  it("keeps public views available when session lookup fails", async () => {
    navigation.path = "/shared/link";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "UNAVAILABLE", message: "Session unavailable" } },
          { status: 503 },
        ),
      ),
    );
    await render();
    expect(container.textContent).toContain("Shared content");
    expect(navigation.replace).not.toHaveBeenCalled();
  });
  it("still requires sign-in for the private task URL", async () => {
    navigation.path = "/documents/id";
    await render();
    expect(container.textContent).not.toContain("Shared content");
    expect(navigation.replace).toHaveBeenCalledWith("/login");
  });
});
