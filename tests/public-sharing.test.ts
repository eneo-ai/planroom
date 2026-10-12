import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import {
  sharedDocumentSchema,
  sharedDocumentSummarySchema,
  sharedProjectSchema,
  updateProjectSharingSchema,
  publicShareTokenSchema,
} from "../src/contracts";
import {
  getSharedDocument,
  listSharedDocuments,
} from "../src/server/documents";
import { getSharedProject } from "../src/server/projects";
import { SharedDocumentView } from "../src/components/shared-document";
import { openApiDocument } from "../src/server/openapi";
import config from "../next.config";

function elements(
  node: DefaultTreeAdapterMap["node"],
  name: string,
): DefaultTreeAdapterMap["element"][] {
  const found = "tagName" in node && node.tagName === name ? [node] : [];
  if ("childNodes" in node)
    for (const child of node.childNodes) found.push(...elements(child, name));
  return found;
}
const document = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  title: "External review",
  description: "A shared plan",
  status: "draft",
  updatedAt: "2026-10-12T10:00:00.000Z",
  files: [
    {
      id: "223e4567-e89b-42d3-a456-426614174000",
      name: "plan.html",
      format: "html",
      content: "<script>attack()</script><h1>Original</h1>",
    },
  ],
  canvas: null,
  teamId: "private",
  role: "owner",
  instructions: "Private instructions",
  authorName: "Private author",
  changeSummary: "Private edit note",
  githubLinks: ["https://github.com/private/repo/issues/1"],
};

describe("public project sharing contract", () => {
  it("has explicit public projections and strict owner decisions", () => {
    expect(Object.keys(sharedDocumentSchema.parse(document)).sort()).toEqual(
      [
        "id",
        "title",
        "description",
        "status",
        "updatedAt",
        "files",
        "canvas",
      ].sort(),
    );
    expect(
      sharedDocumentSummarySchema.parse(document).files[0],
    ).not.toHaveProperty("content");
    expect(
      sharedProjectSchema.parse({
        name: "Project",
        description: "",
        teamName: "Private team",
        public_share_token: "secret",
      }),
    ).toEqual({ name: "Project", description: "" });
    for (const input of [
      { action: "enable" },
      { action: "publish", expectedVersion: 1 },
      { action: "enable", expectedVersion: 0 },
      { action: "enable", expectedVersion: 1, role: "editor" },
    ])
      expect(updateProjectSharingSchema.safeParse(input).success).toBe(false);
    for (const action of ["enable", "rotate", "disable"])
      expect(
        updateProjectSharingSchema.parse({ action, expectedVersion: 1 }).action,
      ).toBe(action);
  });
  it("rejects malformed links uniformly before persistence", async () => {
    for (const token of [
      "",
      "short",
      "a".repeat(44),
      "../private",
      "a".repeat(42) + "/",
    ]) {
      expect(publicShareTokenSchema.safeParse(token).success).toBe(false);
      for (const read of [
        () => getSharedProject(token),
        () => listSharedDocuments(token),
        () => getSharedDocument(token, document.id),
      ])
        await expect(read()).rejects.toMatchObject({
          status: 404,
          code: "NOT_FOUND",
        });
    }
  });
  it("renders a read-only task with its original HTML confined to an opaque iframe", () => {
    const markup = renderToStaticMarkup(
      createElement(SharedDocumentView, {
        document: sharedDocumentSchema.parse(document),
      }),
    );
    const tree = parse(markup);
    const frames = elements(tree, "iframe");
    expect(frames).toHaveLength(1);
    expect(frames[0].attrs.find((attr) => attr.name === "sandbox")?.value).toBe(
      "",
    );
    expect(
      frames[0].attrs.find((attr) => attr.name === "srcdoc")?.value,
    ).toContain(document.files[0].content);
    expect(elements(tree, "script")).toHaveLength(0);
    expect(elements(tree, "textarea")).toHaveLength(0);
    expect(markup).not.toContain("Private instructions");
    for (const label of [
      "Spara",
      "Skriv kommentar",
      "Återställ",
      "/api/documents/",
      "GitHub-kopplingar",
    ])
      expect(markup).not.toContain(label);
    expect(markup).toContain("Endast läsning");
  });
  it("publishes only GET capabilities and prevents indexing/caching of public links", async () => {
    for (const [path, methods] of Object.entries(openApiDocument.paths).filter(
      ([path]) => path.startsWith("/api/shared/"),
    )) {
      expect(Object.keys(methods), path).toEqual(["get"]);
      expect(methods.get?.security).toEqual([]);
      expect(methods.get?.responses["404"]).toBeDefined();
    }
    for (const method of ["get", "put"] as const)
      expect(
        openApiDocument.paths["/api/projects/{id}/sharing"][method]?.security,
      ).toEqual([{ sessionCookie: [] }]);
    const headers = await config.headers?.();
    for (const source of ["/shared/:path*", "/api/shared/:path*"])
      expect(headers?.find((item) => item.source === source)?.headers).toEqual(
        expect.arrayContaining([
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
        ]),
      );
  });
});
