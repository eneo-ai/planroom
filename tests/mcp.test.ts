import { describe, expect, it, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPlanroomServer } from "../src/mcp/server";
import { POST } from "../src/app/api/mcp/route";
import type { Principal } from "../src/server/auth";
import * as auth from "../src/server/auth";
import { AppError } from "../src/server/errors";

const principal: Principal = {
  user: {
    id: "123e4567-e89b-42d3-a456-426614174000",
    name: "Test editor",
    email: "editor@example.com",
    role: "editor",
    mustChangePassword: false,
  },
  authentication: "token",
  tokenHash: "0".repeat(64),
  scope: "read",
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function connect(identity: Principal) {
  const server = createPlanroomServer(identity);
  const client = new Client({
    name: "planroom-contract-test",
    version: "1.0.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("MCP permissions through the official SDK", () => {
  it("advertises only read tools for a read-only token and rejects a direct write call", async () => {
    const session = await connect(principal);
    try {
      const listing = await session.client.listTools();
      expect(listing.tools.map((tool) => tool.name)).toEqual([
        "list_documents",
        "read_document",
        "read_document_github_links",
        "list_revisions",
        "read_revision",
        "read_comments",
      ]);
      for (const name of [
        "update_document",
        "update_document_status",
        "update_document_github_links",
      ]) {
        const result = await session.client.callTool({ name, arguments: {} });
        expect(result.isError).toBe(true);
      }
    } finally {
      await session.close();
    }
  });
  it("keeps viewer access read-only even if presented with a write-scoped token", async () => {
    const session = await connect({
      ...principal,
      scope: "write",
      user: { ...principal.user, role: "viewer" },
    });
    try {
      expect(
        (await session.client.listTools()).tools.every(
          (tool) => tool.annotations?.readOnlyHint,
        ),
      ).toBe(true);
    } finally {
      await session.close();
    }
  });
  it("rejects a write without its document version precondition before any persistence", async () => {
    const session = await connect({ ...principal, scope: "write" });
    try {
      const tools = (await session.client.listTools()).tools;
      expect(tools.some((tool) => tool.name === "update_document")).toBe(true);
      const result = await session.client.callTool({
        name: "update_document",
        arguments: {
          id: principal.user.id,
          title: "Plan",
          files: [
            {
              id: principal.user.id,
              name: "plan.md",
              format: "markdown",
              content: "# Plan",
            },
          ],
          changeSummary: "Change",
        },
      });
      expect(result.isError).toBe(true);
    } finally {
      await session.close();
    }
  });
  it("advertises the shared file contract and rejects invalid replacements through the SDK", async () => {
    const session = await connect({ ...principal, scope: "write" });
    try {
      const tool = (await session.client.listTools()).tools.find(
        (entry) => entry.name === "update_document",
      );
      expect(tool?.inputSchema.required).toContain("files");
      expect(tool?.inputSchema.properties).not.toHaveProperty("html");
      const file = {
        id: principal.user.id,
        name: "plan.md",
        format: "markdown",
        content: "# Plan",
      };
      for (const files of [
        [],
        [{ ...file, name: "plan.html" }],
        [
          file,
          {
            ...file,
            id: "223e4567-e89b-42d3-a456-426614174000",
            name: "PLAN.MD",
          },
        ],
      ]) {
        const response = await session.client.callTool({
          name: "update_document",
          arguments: {
            id: principal.user.id,
            title: "Plan",
            changeSummary: "Change",
            expectedVersion: 1,
            files,
          },
        });
        expect(response.isError).toBe(true);
      }
    } finally {
      await session.close();
    }
  });
  it("advertises dedicated metadata tools and validates their preconditions through the SDK", async () => {
    const session = await connect({ ...principal, scope: "write" });
    try {
      const listing = await session.client.listTools();
      for (const name of [
        "update_document_status",
        "update_document_github_links",
      ]) {
        const tool = listing.tools.find((tool) => tool.name === name);
        expect(tool?.inputSchema.required).toContain(
          name === "update_document_github_links"
            ? "expectedLinksVersion"
            : "expectedVersion",
        );
        expect(tool?.annotations?.readOnlyHint).toBe(false);
        expect(
          (
            await session.client.callTool({
              name,
              arguments: {
                id: principal.user.id,
                status: "ready",
                githubLinks: [],
              },
            })
          ).isError,
        ).toBe(true);
      }
      expect(
        (
          await session.client.callTool({
            name: "update_document_github_links",
            arguments: {
              id: principal.user.id,
              expectedLinksVersion: 1,
              githubLinks: ["javascript:alert(1)"],
            },
          })
        ).isError,
      ).toBe(true);
    } finally {
      await session.close();
    }
  });
});

describe("MCP endpoint security", () => {
  it("rejects a credential revoked while a slow request body is being read", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3210");
    let revoked = false;
    vi.spyOn(auth, "requirePrincipal").mockImplementation(async () => {
      if (revoked)
        throw new AppError(
          401,
          "UNAUTHENTICATED",
          "API-nyckeln har återkallats.",
        );
      return principal;
    });
    let bodyStarted = () => {};
    const reading = new Promise<void>((resolve) => {
      bodyStarted = resolve;
    });
    let finishBody = () => {};
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":',
          ),
        );
        finishBody = () => {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                name: "read_document",
                arguments: { id: principal.user.id },
              }) + "}",
            ),
          );
          controller.close();
        };
      },
      pull() {
        bodyStarted();
      },
    });
    const init = {
      method: "POST",
      headers: {
        host: "localhost:3210",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer test-only-key",
      },
      body,
      duplex: "half" as const,
    };
    const pending = POST(new Request("http://localhost:3210/api/mcp", init));
    await reading;
    revoked = true;
    finishBody();
    const response = await pending;
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "API-nyckeln har återkallats.",
      },
    });
  });
  it("rejects an unconfigured host before authentication", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3210");
    const response = await POST(
      new Request("http://attacker.example/api/mcp", {
        method: "POST",
        headers: { host: "attacker.example" },
      }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("invalid_host");
  });
  it("rejects cross-origin calls even on the configured host", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3210");
    const response = await POST(
      new Request("http://localhost:3210/api/mcp", {
        method: "POST",
        headers: { host: "localhost:3210", origin: "https://attacker.example" },
      }),
    );
    expect(response.status).toBe(403);
  });
  it("does not use a browser session cookie as MCP authorization", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3210");
    const response = await POST(
      new Request("http://localhost:3210/api/mcp", {
        method: "POST",
        headers: {
          host: "localhost:3210",
          cookie: "planroom_session=some-browser-session",
        },
      }),
    );
    expect(response.status).toBe(401);
  });
});
