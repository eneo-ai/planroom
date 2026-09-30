import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mcpConfiguration } from "../src/client/mcp-configuration";

describe("AI client configuration examples", () => {
  it("uses the visible installation address and its external port", () => {
    const local = mcpConfiguration("http://localhost:3100");
    expect(local.endpoint).toBe("http://localhost:3100/api/mcp");
    expect(local.codexCli).toContain('url = "http://localhost:3100/api/mcp"');
    expect(mcpConfiguration("https://plans.example.org").endpoint).toBe(
      "https://plans.example.org/api/mcp",
    );
  });
  it("keeps Claude credentials as a literal environment reference in valid HTTP JSON", () => {
    const schema = z.object({
      mcpServers: z.object({
        planroom: z.object({
          type: z.literal("http"),
          url: z.url(),
          headers: z.object({
            Authorization: z.literal("Bearer ${PLANROOM_API_KEY}"),
          }),
        }),
      }),
    });
    const parsed = schema.parse(
      JSON.parse(mcpConfiguration("https://plans.example.org").claudeCode),
    );
    expect(parsed.mcpServers.planroom.url).toBe(
      "https://plans.example.org/api/mcp",
    );
  });
  it("separates CLI environment authentication from Desktop's explicit placeholder header", () => {
    const configuration = mcpConfiguration("http://localhost:3100");
    expect(configuration.codexCli).toContain(
      'bearer_token_env_var = "PLANROOM_API_KEY"',
    );
    expect(configuration.codexDesktop).not.toContain("bearer_token_env_var");
    expect(configuration.codexDesktop).toContain(
      'Authorization = "Bearer <DIN_PLANROOM_NYCKEL>"',
    );
    expect(configuration.codexLaunch).toContain("<DIN_PLANROOM_NYCKEL>");
    expect(configuration.claudeLaunch).toContain("<DIN_PLANROOM_NYCKEL>");
    expect(() => mcpConfiguration("file:///tmp/planroom")).toThrow("HTTP");
  });
  it("configures Claude Desktop as a local stdio bridge with only placeholder credentials", () => {
    const schema = z.object({
      mcpServers: z.object({
        planroom: z.object({
          command: z.literal("docker"),
          args: z.array(z.string()),
          env: z.object({
            PLANROOM_API_KEY: z.literal("<DIN_PLANROOM_NYCKEL>"),
          }),
        }),
      }),
    });
    const server = schema.parse(
      JSON.parse(mcpConfiguration("http://localhost:3100").claudeDesktop),
    ).mcpServers.planroom;
    expect(server.args).toContain("<ABSOLUT_SÖKVÄG_TILL_PLANROOM>");
    expect(server.args).toContain("-T");
    expect(server.args.slice(-3)).toEqual([
      "-e",
      "PLANROOM_API_KEY",
      "mcp-bridge",
    ]);
  });
});
