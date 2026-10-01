import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/documents/[id]/export/route";
import * as auth from "../src/server/auth";
import * as documents from "../src/server/documents";
import { documentDetailSchema } from "../src/contracts";
import { AppError } from "../src/server/errors";

const document = documentDetailSchema.parse({
  id: "123e4567-e89b-42d3-a456-426614174000",
  title: "Plan",
  description: "",
  status: "draft",
  githubLinks: [],
  currentRevision: 1,
  canvas: null,
  version: 1,
  githubLinksVersion: 1,
  authorName: "Editor",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  instructions: "",
  changeSummary: "Import",
  files: [
    {
      id: "223e4567-e89b-42d3-a456-426614174000",
      name: "original.html",
      format: "html",
      content:
        "<!doctype html>\r\n<svg>Original</svg><script>demo()</script>  ",
    },
    {
      id: "323e4567-e89b-42d3-a456-426614174000",
      name: "beslut åäö.md",
      format: "markdown",
      content: "  # Beslut\r\n\r\n- [ ] Nästa steg  \r\n",
    },
  ],
});
const principal: auth.Principal = {
  user: {
    id: document.id,
    name: "Reader",
    email: "reader@example.test",
    role: "viewer",
    mustChangePassword: false,
  },
  authentication: "token",
  tokenHash: "0".repeat(64),
  scope: "read",
};
afterEach(() => vi.restoreAllMocks());
function exportFile(query = "") {
  return GET(
    new Request(`http://localhost/api/documents/${document.id}/export${query}`),
    { params: Promise.resolve({ id: document.id }) },
  );
}
function authenticated() {
  vi.spyOn(auth, "requirePrincipal").mockResolvedValue(principal);
  vi.spyOn(documents, "getDocument").mockResolvedValue(document);
}
describe("original planning file export", () => {
  it("exports either format with exact source, filename and safe attachment headers", async () => {
    authenticated();
    for (const file of document.files) {
      const response = await exportFile(`?fileId=${file.id}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(file.content);
      expect(response.headers.get("Content-Type")).toBe(
        `text/${file.format === "html" ? "html" : "markdown"}; charset=utf-8`,
      );
      expect(response.headers.get("Content-Disposition")).toContain(
        `filename*=UTF-8''${encodeURIComponent(file.name)}`,
      );
      expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  });
  it("requires a choice for mixed plans and selects the sole source for a single-file plan", async () => {
    authenticated();
    const missing = await exportFile();
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.code).toBe("FILE_REQUIRED");
    vi.spyOn(documents, "getDocument").mockResolvedValue({
      ...document,
      files: [document.files[1]],
    });
    const single = await exportFile();
    expect(single.status).toBe(200);
    expect(await single.text()).toBe(document.files[1].content);
  });
  it("rejects invalid or unknown file identities and unauthenticated readers", async () => {
    authenticated();
    expect((await exportFile("?fileId=invalid")).status).toBe(400);
    expect((await exportFile(`?fileId=${document.id}`)).status).toBe(404);
    vi.spyOn(auth, "requirePrincipal").mockRejectedValue(
      new AppError(401, "UNAUTHENTICATED", "Sign in"),
    );
    expect((await exportFile(`?fileId=${document.files[0].id}`)).status).toBe(
      401,
    );
  });
});
