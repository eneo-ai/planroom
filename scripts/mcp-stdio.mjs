import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const shutdownSignal = new AbortController();
const upstream = new Client({
  name: "planroom-desktop-bridge",
  version: "0.1.0",
});
let server;
let closing;

function configuration() {
  const token = process.env.PLANROOM_API_KEY;
  if (!token || token.length > 512 || /\s/.test(token))
    throw new Error("Missing API key");
  const endpoint = new URL(
    process.env.PLANROOM_MCP_URL ?? "http://app:3000/api/mcp",
  );
  const application = new URL(process.env.APP_URL ?? "http://localhost:3210");
  for (const url of [endpoint, application]) {
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("Invalid endpoint");
  }
  const internal = endpoint.href === "http://app:3000/api/mcp";
  for (const url of [application, ...(internal ? [] : [endpoint])]) {
    const loopback =
      url.hostname === "localhost" ||
      url.hostname === "[::1]" ||
      /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname);
    if (url.protocol !== "https:" && !loopback)
      throw new Error("Remote connections require HTTPS");
  }
  if (
    application.pathname !== "/" ||
    endpoint.pathname !== "/api/mcp" ||
    (!internal && endpoint.origin !== application.origin)
  )
    throw new Error("Endpoint must match application");
  return { token, endpoint, application, internal };
}

async function shutdown(failed = false) {
  if (failed) process.exitCode = 1;
  if (!closing) {
    shutdownSignal.abort();
    closing = Promise.resolve().then(async () => {
      await Promise.allSettled([server?.close(), upstream.close()]);
      process.stdin.pause();
    });
  }
  await closing;
}

// stdout belongs exclusively to the MCP stdio transport.
function reportFailure() {
  process.stderr.write(
    "Planroom MCP bridge could not complete the request. Check the app address, API key and running service.\n",
  );
}

async function main() {
  const { token, endpoint, application, internal } = configuration();
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: async (url, init) => {
      if (new URL(url).href !== endpoint.href)
        throw new Error("Unexpected endpoint");
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${token}`);
      if (internal) headers.set("Host", application.host);
      const signals = [shutdownSignal.signal, AbortSignal.timeout(30_000)];
      if (init?.signal) signals.push(init.signal);
      return fetch(url, {
        ...init,
        headers,
        redirect: "error",
        credentials: "omit",
        signal: AbortSignal.any(signals),
      });
    },
  });
  await upstream.connect(transport);
  if (shutdownSignal.signal.aborted) {
    await upstream.close();
    return;
  }
  server = new Server(
    { name: "planroom-desktop-bridge", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions: upstream.getInstructions(),
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    try {
      return await upstream.listTools(request.params, { timeout: 35_000 });
    } catch {
      reportFailure();
      throw new Error("Planroom service is unavailable.");
    }
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await upstream.callTool(request.params, undefined, {
        timeout: 35_000,
      });
    } catch {
      reportFailure();
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Planroom service is unavailable. Read the document again before retrying a write.",
          },
        ],
      };
    }
  });
  server.onerror = () => {
    reportFailure();
  };
  server.onclose = () => {
    void shutdown();
  };
  await server.connect(
    new StdioServerTransport(process.stdin, process.stdout, {
      maxBufferSize: 3 * 1024 * 1024,
    }),
  );
}

process.stdin.once("end", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
process.once("SIGINT", () => {
  void shutdown();
});
process.stdout.on("error", () => {
  void shutdown(true);
});
process.on("uncaughtException", () => {
  reportFailure();
  void shutdown(true);
});
process.on("unhandledRejection", () => {
  reportFailure();
  void shutdown(true);
});
main().catch(() => {
  reportFailure();
  void shutdown(true);
});
