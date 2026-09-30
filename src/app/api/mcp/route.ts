import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPlanroomServer } from "@/mcp/server";
import { requirePrincipal } from "@/server/auth";
import { api, AppError, readJson } from "@/server/http";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyEndpoint(request: Request) {
  const expected = new URL(process.env.APP_URL ?? "http://localhost:3210");
  const allowedHosts = new Set([expected.host]);
  const allowedOrigins = new Set([expected.origin]);
  if (expected.hostname === "localhost" || expected.hostname === "127.0.0.1") {
    const alternate = new URL(expected);
    alternate.hostname =
      expected.hostname === "localhost" ? "127.0.0.1" : "localhost";
    allowedHosts.add(alternate.host);
    allowedOrigins.add(alternate.origin);
  }
  if (
    !allowedHosts.has(request.headers.get("host") ?? new URL(request.url).host)
  ) {
    throw new AppError(403, "invalid_host", "The MCP host must match APP_URL.");
  }
  const origin = request.headers.get("origin");
  if (origin !== null && !allowedOrigins.has(origin)) {
    throw new AppError(
      403,
      "invalid_origin",
      "This MCP origin is not allowed.",
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  return api(async () => {
    verifyEndpoint(request);
    await requirePrincipal(request, { tokenOnly: true });
    const parsedBody = await readJson(request, z.unknown());
    if (Array.isArray(parsedBody))
      throw new AppError(
        400,
        "BATCH_NOT_SUPPORTED",
        "Send one MCP message per request.",
      );
    // Body admission may wait for a slow sender. Bind tools only to credentials
    // that are still active after reading, including read-only tools.
    const principal = await requirePrincipal(request, { tokenOnly: true });
    const server = createPlanroomServer(principal);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 3_000_000,
    });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request, { parsedBody });
      response.headers.set("Cache-Control", "no-store");
      return response;
    } finally {
      await server.close();
    }
  });
}

// Stateless JSON transport has no subscription stream or session to delete.
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
