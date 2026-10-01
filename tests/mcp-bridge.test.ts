import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { planningFilesSchema } from "../src/contracts";

const script = fileURLToPath(
  new URL("../scripts/mcp-stdio.mjs", import.meta.url),
);
const fixture = fileURLToPath(
  new URL("./fixtures/bridge-http-fixture.mjs", import.meta.url),
);
function clientFor(token: string) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", fixture, script],
    env: {
      APP_URL: "http://localhost:3210",
      PLANROOM_MCP_URL: "http://app:3000/api/mcp",
      PLANROOM_API_KEY: token,
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "desktop-bridge-test", version: "1.0.0" });
  let diagnostics = "";
  transport.stderr?.on("data", (chunk: Buffer) => {
    diagnostics += chunk.toString("utf8");
  });
  return { client, transport, diagnostics: () => diagnostics };
}
function resultJson(value: unknown): unknown {
  const text = CallToolResultSchema.parse(value).content.find(
    (block) => block.type === "text",
  );
  if (!text || text.type !== "text")
    throw new Error("Expected JSON text result");
  return JSON.parse(text.text);
}

describe("Claude Desktop stdio bridge", () => {
  it("preserves upstream tools, document content and version conflict results", async () => {
    const bridge = clientFor("pr_test_write");
    try {
      await bridge.client.connect(bridge.transport);
      expect(bridge.client.getInstructions()).toContain("preserve HTML");
      expect(
        (await bridge.client.listTools()).tools.map((tool) => tool.name),
      ).toEqual(["read_document", "update_document"]);
      const document = z.object({
        files: planningFilesSchema,
        currentRevision: z.number(),
      });
      expect(
        document.parse(
          resultJson(await bridge.client.callTool({ name: "read_document" })),
        ),
      ).toEqual({
        files: [
          {
            id: "123e4567-e89b-42d3-a456-426614174000",
            name: "plan.html",
            format: "html",
            content: "<h1>Original visual plan</h1>",
          },
        ],
        currentRevision: 1,
      });
      const update = {
        name: "update_document",
        arguments: {
          files: [
            {
              id: "123e4567-e89b-42d3-a456-426614174000",
              name: "plan.md",
              format: "markdown",
              content: "# Updated plan",
            },
          ],
          expectedVersion: 1,
        },
      };
      expect(
        document.parse(resultJson(await bridge.client.callTool(update))),
      ).toEqual({ files: update.arguments.files, currentRevision: 2 });
      const stale = await bridge.client.callTool(update);
      expect(stale.isError).toBe(true);
      expect(resultJson(stale)).toEqual({
        error: { code: "DOCUMENT_CONFLICT", currentVersion: 2 },
      });
    } finally {
      await bridge.client.close();
    }
    expect(bridge.diagnostics()).toBe("");
  });
  it("keeps read tokens read-only instead of advertising write tools", async () => {
    const bridge = clientFor("pr_test_read");
    try {
      await bridge.client.connect(bridge.transport);
      expect(
        (await bridge.client.listTools()).tools.map((tool) => tool.name),
      ).toEqual(["read_document"]);
      expect(
        (
          await bridge.client.callTool({
            name: "update_document",
            arguments: {
              expectedVersion: 1,
              files: [
                {
                  id: "123e4567-e89b-42d3-a456-426614174000",
                  name: "plan.md",
                  format: "markdown",
                  content: "# No write",
                },
              ],
            },
          })
        ).isError,
      ).toBe(true);
      expect(
        z
          .object({ currentRevision: z.number() })
          .parse(
            resultJson(await bridge.client.callTool({ name: "read_document" })),
          ).currentRevision,
      ).toBe(1);
    } finally {
      await bridge.client.close();
    }
    expect(bridge.diagnostics()).toBe("");
  });
  it("rejects mismatched remote origins before contacting HTTP and never prints secrets", async () => {
    const secret = "pr_test_never_print_this_secret";
    const child = spawn(process.execPath, ["--import", fixture, script], {
      env: {
        NODE_ENV: "test",
        APP_URL: "https://plans.example.test",
        PLANROOM_MCP_URL: "https://attacker.example.test/api/mcp",
        PLANROOM_API_KEY: secret,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.stdin.end();
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Planroom MCP bridge");
    expect(stderr).not.toContain(secret);
    expect(stderr).not.toContain("attacker");
  });
  it.each([
    ["http://plans.example.test", "http://plans.example.test/api/mcp"],
    ["http://192.168.1.20", "http://app:3000/api/mcp"],
  ])(
    "rejects plaintext credentials for remote deployments: %s",
    async (application, endpoint) => {
      const secret = "pr_test_never_send_this_secret";
      const child = spawn(process.execPath, ["--import", fixture, script], {
        env: {
          NODE_ENV: "test",
          APP_URL: application,
          PLANROOM_MCP_URL: endpoint,
          PLANROOM_API_KEY: secret,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.stdin.end();
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
      expect(exitCode).toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toContain("Planroom MCP bridge");
      expect(stderr).not.toContain(secret);
      expect(stderr).not.toContain(application);
    },
  );
});
