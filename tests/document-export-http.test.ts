import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/documents/[id]/export/route";
import * as auth from "../src/server/auth";
import * as documents from "../src/server/documents";
import { AppError } from "../src/server/errors";
import { documentDetailSchema } from "../src/contracts";

const id = "633bc16c-cd8b-4fb2-93b8-2e1b593ef52d";
const saved = documentDetailSchema.parse({
  id,
  title: 'Åtgärder\r\n"Injected: value',
  description: "",
  status: "active",
  currentRevision: 3,
  version: 7,
  githubLinks: [],
  githubLinksVersion: 1,
  html: "<!doctype html>\r\n<svg><text>Original åäö</text></svg><script>demo()</script>",
  instructions: "Preserve",
  changeSummary: "Original source",
  authorName: "Author",
  createdAt: "2026-10-01T07:00:00.000Z",
  updatedAt: "2026-10-01T08:00:00.000Z",
});
const principal: auth.Principal = {
  authentication: "token",
  tokenHash: "0".repeat(64),
  scope: "read",
  user: {
    id,
    name: "Reader",
    email: "reader@example.test",
    role: "viewer",
    mustChangePassword: false,
  },
};
afterEach(() => vi.restoreAllMocks());
describe("HTML attachment contract", () => {
  it("returns byte-identical saved source with a safe filename and download/security headers", async () => {
    vi.spyOn(auth, "requirePrincipal").mockResolvedValue(principal);
    vi.spyOn(documents, "getDocument").mockResolvedValue(saved);
    const response = await GET(
      new Request(`https://planroom.test/api/documents/${id}/export`),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(saved.html);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="atgarder-injected-value-v3.html"',
    );
    expect(response.headers.get("Content-Type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
  });
  it("returns an authenticated error instead of exposing HTML when authentication fails", async () => {
    vi.spyOn(auth, "requirePrincipal").mockRejectedValue(
      new AppError(401, "UNAUTHENTICATED", "Sign in"),
    );
    const response = await GET(
      new Request(`https://planroom.test/api/documents/${id}/export`),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Sign in" },
    });
  });
});
