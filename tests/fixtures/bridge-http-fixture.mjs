// Test-only HTTP replacement. The production bridge still runs unchanged in
// its own process and both protocol ends use the official MCP SDK.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

let revision = 1;
let html = "<h1>Original visual plan</h1>";
globalThis.fetch = async (url, init) => {
  const request = new Request(url, init);
  if (
    request.headers.get("host") !== "localhost:3210" ||
    init.redirect !== "error" ||
    !init.signal
  )
    throw new Error("Host/redirect/timeout contract broken");
  const key = request.headers.get("authorization");
  if (key !== "Bearer pr_test_read" && key !== "Bearer pr_test_write")
    throw new Error("Unexpected credential");
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const writes = key === "Bearer pr_test_write";
  const server = new Server(
    { name: "test-planroom-http", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Read the latest document; preserve HTML and use expectedRevision.",
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "read_document",
        description: "Read original HTML",
        inputSchema: { type: "object", properties: {} },
      },
      ...(writes
        ? [
            {
              name: "update_document",
              description: "Save next revision",
              inputSchema: { type: "object", properties: {} },
            },
          ]
        : []),
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    if (params.name === "read_document")
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ html, currentRevision: revision }),
          },
        ],
      };
    if (params.name === "update_document" && writes) {
      if (params.arguments?.expectedRevision !== revision)
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: { code: "REVISION_CONFLICT", currentRevision: revision },
              }),
            },
          ],
        };
      html = String(params.arguments.html);
      revision++;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ html, currentRevision: revision }),
          },
        ],
      };
    }
    return { isError: true, content: [{ type: "text", text: "FORBIDDEN" }] };
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
};
