import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  apiDiscoverySchema,
  apiErrorBodySchema,
  documentDetailSchema,
  documentsResponseSchema,
  sessionResponseSchema,
  userResponseSchema,
} from "../src/contracts";
import { apiDiscovery, openApiDocument } from "../src/server/openapi";
import { GET as discovery } from "../src/app/api/route";
import { GET as specification } from "../src/app/api/openapi.json/route";

function operation(path: string, method: "get" | "post" | "put" | "delete") {
  const result = openApiDocument.paths[path]?.[method];
  if (!result) throw new Error(`Undocumented operation ${method} ${path}`);
  return result;
}

describe("published REST API contracts", () => {
  it("documents every implemented REST route and excludes the separate MCP protocol", async () => {
    const directory = fileURLToPath(
      new URL("../src/app/api/", import.meta.url),
    );
    const files = await readdir(directory, { recursive: true });
    const documented = new Set<string>();
    for (const file of files.filter((name) => name.endsWith("route.ts"))) {
      if (file === "mcp/route.ts") continue;
      const path = `/api/${file.slice(0, -"route.ts".length)}`
        .replace(/\/$/, "")
        .replace(/\[([^\]]+)\]/g, "{$1}");
      const source = await readFile(`${directory}${file}`, "utf8");
      for (const match of source.matchAll(
        /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE)\s*\(/g,
      )) {
        const method = z
          .enum(["get", "post", "put", "delete"])
          .parse(match[1].toLowerCase());
        expect(operation(path, method).operationId).toBeTruthy();
        documented.add(`${method} ${path}`);
      }
    }
    const declared = Object.entries(openApiDocument.paths).flatMap(
      ([path, methods]) =>
        Object.keys(methods).map((method) => `${method} ${path}`),
    );
    expect(new Set(declared)).toEqual(documented);
    expect(openApiDocument.paths["/api/mcp"]).toBeUndefined();
    expect(openApiDocument.info.description).toContain(
      "Model Context Protocol",
    );
  });
  it("generates request constraints and defaults from canonical input schemas", () => {
    const schemas = openApiDocument.components.schemas;
    expect(schemas.LoginRequest.properties?.email).toMatchObject({
      type: "string",
      format: "email",
      maxLength: 254,
    });
    expect(schemas.SetupRequest.properties?.password).toMatchObject({
      type: "string",
      minLength: 12,
      maxLength: 256,
    });
    expect(schemas.DocumentContent.required).toEqual([
      "title",
      "files",
      "changeSummary",
    ]);
    expect(schemas.DocumentContent.properties?.files).toMatchObject({
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        required: ["id", "name", "format", "content"],
        properties: {
          id: { format: "uuid" },
          format: { enum: ["html", "markdown"] },
          content: { minLength: 1, maxLength: 2_000_000 },
        },
      },
    });
    expect(schemas.DocumentContent.properties?.status).toMatchObject({
      enum: [
        "draft",
        "active",
        "ready",
        "in_development",
        "completed",
        "archived",
      ],
      default: "draft",
    });
    expect(schemas.DocumentUpdate.required).toContain("expectedVersion");
    expect(schemas.DocumentUpdate.properties?.expectedVersion).toMatchObject({
      type: "integer",
      exclusiveMinimum: 0,
      maximum: 2147483647,
    });
    expect(schemas.DocumentStatusUpdate.required).toEqual([
      "expectedVersion",
      "status",
    ]);
    expect(schemas.DocumentGitHubLinksUpdate.required).toEqual([
      "expectedLinksVersion",
      "githubLinks",
    ]);
    expect(
      schemas.DocumentGitHubLinksUpdate.properties?.githubLinks,
    ).toMatchObject({ type: "array", maxItems: 20 });
    expect(
      operation("/api/documents/{id}/status", "put").responses["409"],
    ).toBeDefined();
    expect(
      operation("/api/documents/{id}/github-links", "put").security,
    ).toEqual([{ sessionCookie: [] }, { bearerAuth: [] }]);
    expect(schemas.CreateTokenRequest.properties?.scope).toMatchObject({
      enum: ["read", "write"],
    });
    expect(schemas.CreateUserRequest.properties?.role).toMatchObject({
      enum: ["admin", "editor", "viewer"],
    });
  });
  it("exposes small metadata responses and independent link read/write preconditions", () => {
    const statusResponse = operation("/api/documents/{id}/status", "put")
      .responses["200"];
    expect(statusResponse.content?.["application/json"].schema).toEqual({
      $ref: "#/components/schemas/DocumentSummary",
    });
    for (const method of ["get", "put"] as const) {
      const response = operation("/api/documents/{id}/github-links", method)
        .responses["200"];
      expect(response.content?.["application/json"].schema).toEqual({
        $ref: "#/components/schemas/DocumentGitHubLinks",
      });
    }
    const schemas = openApiDocument.components.schemas;
    expect(schemas.DocumentGitHubLinks.properties).not.toHaveProperty("html");
    expect(schemas.DocumentSummary.properties).not.toHaveProperty("html");
    expect(schemas.DocumentGitHubLinks.properties).toHaveProperty(
      "githubLinksVersion",
    );
  });
  it("matches response wrapper shapes while keeping session identity nullable and secrets out of users", () => {
    const user = {
      id: "f7939fd0-381b-4c8d-9f53-5adbe728ca38",
      name: "Real admin",
      email: "admin@example.test",
      role: "admin",
      mustChangePassword: false,
    };
    const document = {
      id: "633bc16c-cd8b-4fb2-93b8-2e1b593ef52d",
      title: "Plan",
      description: "",
      status: "draft",
      githubLinks: [],
      githubLinksVersion: 1,
      version: 1,
      currentRevision: 1,
      authorName: user.name,
      createdAt: "2026-09-30T10:00:00.000Z",
      updatedAt: "2026-09-30T10:00:00.000Z",
      files: [
        {
          id: user.id,
          name: "plan.html",
          format: "html",
          content: "<svg>Diagram</svg>",
        },
      ],
      instructions: "Preserve diagram",
      changeSummary: "Initial",
    };
    expect(userResponseSchema.parse({ user })).toEqual({ user });
    expect(sessionResponseSchema.parse({ user: null })).toEqual({ user: null });
    expect(
      documentsResponseSchema.parse({ documents: [document] }).documents[0],
    ).toHaveProperty("files", [
      { id: user.id, name: "plan.html", format: "html" },
    ]);
    expect(documentDetailSchema.parse(document)).toEqual(document);
    expect(
      apiErrorBodySchema.parse({
        error: {
          code: "DOCUMENT_CONFLICT",
          message: "Read again",
          currentVersion: 2,
        },
      }),
    ).toEqual({
      error: {
        code: "DOCUMENT_CONFLICT",
        message: "Read again",
        currentVersion: 2,
      },
    });
    expect(
      openApiDocument.components.schemas.User.properties,
    ).not.toHaveProperty("password_hash");
    expect(
      openApiDocument.components.schemas.User.properties,
    ).not.toHaveProperty("sessionHash");
  });
  it("accurately separates bearer reads/writes from session-only credential and admin operations", () => {
    expect(operation("/api/documents", "get").security).toEqual([
      { sessionCookie: [] },
      { bearerAuth: [] },
    ]);
    expect(operation("/api/documents/{id}", "put").security).toEqual([
      { sessionCookie: [] },
      { bearerAuth: [] },
    ]);
    expect(operation("/api/tokens", "get").security).toEqual([
      { sessionCookie: [] },
      { bearerAuth: [] },
    ]);
    for (const [path, method] of [
      ["/api/auth/setup", "post"],
      ["/api/tokens", "post"],
      ["/api/tokens/{id}", "delete"],
      ["/api/admin/users", "get"],
      ["/api/admin/users", "post"],
    ] as const) {
      expect(operation(path, method).security).toEqual([{ sessionCookie: [] }]);
    }
    expect(operation("/api/auth/setup", "post").parameters).toContainEqual(
      expect.objectContaining({ name: "Origin", required: true }),
    );
    expect(operation("/api/documents/{id}", "put").parameters).toContainEqual(
      expect.objectContaining({ name: "Origin", required: false }),
    );
    expect(operation("/api/auth/session", "get").security).toContainEqual({});
    expect(operation("/api/auth/logout", "post").security).toContainEqual({});
  });
  it("documents conflict recovery, raw HTML export and health's distinct 503 contract", () => {
    const update = operation("/api/documents/{id}", "put");
    expect(
      update.responses["409"].content?.["application/json"].schema,
    ).toEqual({ $ref: "#/components/schemas/ApiErrorBody" });
    expect(update.description).toContain("reconcile");
    expect(
      operation("/api/documents/{id}/revisions/{number}/restore", "post")
        .responses["409"],
    ).toBeDefined();
    const exported = operation("/api/documents/{id}/export", "get").responses[
      "200"
    ];
    expect(exported.content?.["text/html"].schema).toEqual({ type: "string" });
    expect(exported.content?.["text/markdown"].schema).toEqual({
      type: "string",
    });
    expect(
      operation("/api/documents/{id}/export", "get").parameters,
    ).toContainEqual(
      expect.objectContaining({
        name: "fileId",
        in: "query",
        schema: { type: "string", format: "uuid" },
      }),
    );
    expect(exported.headers?.["Content-Disposition"].description).toContain(
      "attachment",
    );
    expect(
      operation("/api/health", "get").responses["503"].content?.[
        "application/json"
      ].schema,
    ).toEqual({ $ref: "#/components/schemas/UnavailableResponse" });
    expect(operation("/api/auth/login", "post").responses["429"]).toBeDefined();
  });
  it("exposes body deadlines, authentication budgets and key expiry in the public contract", () => {
    for (const methods of Object.values(openApiDocument.paths)) {
      for (const entry of Object.values(methods)) {
        if (entry.requestBody) {
          expect(
            entry.responses["408"].content?.["application/json"].schema,
          ).toEqual({ $ref: "#/components/schemas/ApiErrorBody" });
        }
      }
    }
    expect(operation("/api/auth/setup", "post").responses["429"]).toBeDefined();
    expect(
      operation("/api/admin/users", "post").responses["429"],
    ).toBeDefined();
    expect(openApiDocument.components.schemas.ApiToken.required).toContain(
      "expiresAt",
    );
    expect(operation("/api/tokens", "post").description).toContain("90 days");
  });
  it("publishes same-origin discovery/specification without requiring identity or reflecting the request host", async () => {
    const response = discovery();
    expect(response.status).toBe(200);
    expect(apiDiscoverySchema.parse(await response.json())).toMatchObject({
      documentation: "/api/docs",
      openapi: "/api/openapi.json",
      mcp: { endpoint: "/api/mcp", documentation: "/settings" },
    });
    expect(openApiDocument.info.title).toBe(apiDiscovery.name);
    expect(openApiDocument.info.version).toBe(apiDiscovery.version);
    expect(openApiDocument.externalDocs.url).toBe(apiDiscovery.documentation);
    const publicSpec = specification();
    const value: unknown = await publicSpec.json();
    expect(
      z
        .object({
          openapi: z.literal("3.1.0"),
          servers: z.array(z.object({ url: z.string() })),
        })
        .parse(value),
    ).toEqual({ openapi: "3.1.0", servers: [{ url: "/" }] });
    for (const path of ["/api", "/api/openapi.json", "/api/health"])
      expect(operation(path, "get").security).toEqual([]);
  });
});
