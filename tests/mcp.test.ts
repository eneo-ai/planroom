import { describe, expect, it, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPlanroomServer } from "../src/mcp/server";
import { POST } from "../src/app/api/mcp/route";
import type { Principal } from "../src/server/auth";

const principal: Principal = {
  user: {
    id: "123e4567-e89b-42d3-a456-426614174000",
    name: "Test editor",
    email: "editor@example.com",
    role: "editor",
    mustChangePassword: false,
  },
  authentication: "token",
  scope: "read",
};
afterEach(() => vi.unstubAllEnvs());

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
        "list_revisions",
        "read_revision",
        "read_comments",
      ]);
      const result = await session.client.callTool({
        name: "update_document",
        arguments: {},
      });
      expect(result.isError).toBe(true);
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
  it("rejects a write without its revision precondition before any persistence", async () => {
    const session = await connect({ ...principal, scope: "write" });
    try {
      const tools = (await session.client.listTools()).tools;
      expect(tools.some((tool) => tool.name === "update_document")).toBe(true);
      const result = await session.client.callTool({
        name: "update_document",
        arguments: {
          id: principal.user.id,
          title: "Plan",
          html: "<p>Plan</p>",
          changeSummary: "Change",
        },
      });
      expect(result.isError).toBe(true);
    } finally {
      await session.close();
    }
  });
});

describe("MCP endpoint security", () => {
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
