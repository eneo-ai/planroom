import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/server/db";
import { migrate } from "../src/server/migrate";
import { seedBootstrap } from "../src/server/bootstrap";
import {
  createToken,
  createUser,
  deleteToken,
  findPrincipal,
  login,
  replaceAccount,
  requirePrincipal,
  type Principal,
} from "../src/server/auth";
import {
  createDocument,
  getDocument,
  getRevision,
  listRevisions,
  restoreDocument,
  updateDocument,
} from "../src/server/documents";
import { AppError } from "../src/server/errors";
import { documentContentSchema } from "../src/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  POST as mcpPost,
  GET as mcpGet,
  DELETE as mcpDelete,
} from "../src/app/api/mcp/route";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const content = documentContentSchema.parse({
  title: "Concurrent planning",
  html: "<h1>Original</h1><script>localDemo()</script>",
  instructions: "Preserve diagrams",
  changeSummary: "Initial revision",
});
async function sessionPrincipal(secret: string): Promise<Principal> {
  const principal = await findPrincipal(
    new Request("http://localhost/api", {
      headers: { cookie: `planroom_session=${secret}` },
    }),
  );
  if (!principal) throw new Error("Expected active authenticated session");
  return principal;
}
async function waitForBlockedQuery(
  sql: string,
  minimumCount = 1,
): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const waiting = await db.query(
      "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query=$1",
      [sql],
    );
    if (waiting.rows.length >= minimumCount) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    "Expected credential operation to wait for the held user lock",
  );
}
describe.skipIf(!enabled)("PostgreSQL document and identity behavior", () => {
  let principal: Principal;
  beforeAll(async () => {
    if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL)
      throw new Error(
        "Integration tests require DATABASE_URL=TEST_DATABASE_URL pointing to a disposable database.",
      );
    await migrate();
    await migrate();
    await db.query(
      "TRUNCATE bootstrap,login_attempts,comments,document_revisions,documents,api_tokens,sessions,users CASCADE",
    );
    process.env.SEED_ADMIN_PASSWORD = "Initial long password 123";
    process.env.SEED_ADMIN_EMAIL = "admin@planroom.local";
    process.env.SEED_EXAMPLE = "false";
    await seedBootstrap();
    const initial = await login(
      "admin@planroom.local",
      "Initial long password 123",
    );
    const initialPrincipal = await sessionPrincipal(initial.secret);
    await expect(
      createDocument(initialPrincipal, content),
    ).rejects.toMatchObject({ code: "ACCOUNT_SETUP_REQUIRED" });
    const ready = await replaceAccount(initialPrincipal, {
      name: "Real admin",
      email: "real-admin@example.test",
      currentPassword: "Initial long password 123",
      password: "Changed long password 456",
    });
    principal = await sessionPrincipal(ready.secret);
    expect(
      await findPrincipal(
        new Request("http://localhost/api", {
          headers: { cookie: `planroom_session=${initial.secret}` },
        }),
      ),
    ).toBeNull();
    expect(
      (
        await findPrincipal(
          new Request("http://localhost/api", {
            headers: { cookie: `planroom_session=${ready.secret}` },
          }),
        )
      )?.user.mustChangePassword,
    ).toBe(false);
  });
  afterAll(async () => {
    await db.end();
  });
  it("seeds exactly once after the start account has been renamed, even without its password", async () => {
    delete process.env.SEED_ADMIN_PASSWORD;
    await Promise.all([seedBootstrap(), seedBootstrap()]);
    const users = (await db.query<{ email: string }>("SELECT email FROM users"))
      .rows;
    expect(users).toEqual([{ email: "real-admin@example.test" }]);
  });
  it("allows one concurrent update, rolls back the loser, and restores into a new revision", async () => {
    const original = await createDocument(principal, content);
    const results = await Promise.allSettled([
      updateDocument(principal, original.id, {
        ...content,
        html: "<p>Writer A</p>",
        changeSummary: "A",
        expectedRevision: 1,
      }),
      updateDocument(principal, original.id, {
        ...content,
        html: "<p>Writer B</p>",
        changeSummary: "B",
        expectedRevision: 1,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    if (!rejection || rejection.status !== "rejected")
      throw new Error("Expected one conflict");
    expect(rejection.reason).toMatchObject({ status: 409, currentRevision: 2 });
    expect(
      (await listRevisions(principal, original.id)).map(
        (revision) => revision.number,
      ),
    ).toEqual([2, 1]);
    await expect(
      restoreDocument(principal, original.id, 999, {
        expectedRevision: 2,
        changeSummary: "Missing",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await getDocument(principal, original.id)).currentRevision).toBe(2);
    expect(
      await restoreDocument(principal, original.id, 1, {
        expectedRevision: 2,
        changeSummary: "Restore original",
      }),
    ).toMatchObject({
      currentRevision: 3,
      html: content.html,
      instructions: content.instructions,
    });
    expect((await getRevision(principal, original.id, 1)).html).toBe(
      content.html,
    );
    expect(await listRevisions(principal, original.id)).toHaveLength(3);
  });
  it("enforces token scope and inherited user role and never accepts cookies at MCP", async () => {
    const record = await createToken(principal, {
      name: "Read integration",
      scope: "read",
    });
    const request = new Request("http://localhost/api/mcp", {
      headers: { authorization: `Bearer ${record.token}` },
    });
    const tokenPrincipal = await requirePrincipal(request, { tokenOnly: true });
    expect(tokenPrincipal.scope).toBe("read");
    await expect(createDocument(tokenPrincipal, content)).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(
      createUser(tokenPrincipal, {
        name: "Forbidden user",
        email: "forbidden@example.test",
        password: "Long password here 123",
        role: "viewer",
      }),
    ).rejects.toBeInstanceOf(AppError);
    const account = await login(
      "real-admin@example.test",
      "Changed long password 456",
    );
    await expect(
      requirePrincipal(
        new Request("http://localhost/api/mcp", {
          headers: { cookie: `planroom_session=${account.secret}` },
        }),
        { tokenOnly: true },
      ),
    ).rejects.toMatchObject({ status: 401 });
    await deleteToken(principal, record.record.id);
    expect(await findPrincipal(request, true)).toBeNull();
    const writeRecord = await createToken(principal, {
      name: "Write integration",
      scope: "write",
    });
    const writeRequest = new Request("http://localhost/api/mcp", {
      headers: { authorization: `Bearer ${writeRecord.token}` },
    });
    const writePrincipal = await requirePrincipal(writeRequest, {
      tokenOnly: true,
    });
    await expect(
      createUser(writePrincipal, {
        name: "Forbidden user",
        email: "forbidden@example.test",
        password: "Long password here 123",
        role: "viewer",
      }),
    ).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
    await db.query("UPDATE users SET role='viewer' WHERE id=$1", [
      principal.user.id,
    ]);
    try {
      await expect(
        createDocument(
          await requirePrincipal(writeRequest, { tokenOnly: true }),
          content,
        ),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      await db.query("UPDATE users SET role='admin' WHERE id=$1", [
        principal.user.id,
      ]);
    }
    const viewer = await createUser(principal, {
      name: "Viewer user",
      email: "viewer@example.test",
      password: "Long viewer password 123",
      role: "viewer",
    });
    const readyViewer = await replaceAccount(
      await sessionPrincipal(
        (await login(viewer.email, "Long viewer password 123")).secret,
      ),
      {
        name: viewer.name,
        email: viewer.email,
        currentPassword: "Long viewer password 123",
        password: "Changed viewer password 456",
      },
    );
    await expect(
      createDocument(await sessionPrincipal(readyViewer.secret), content),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("successful logins do not accumulate into a lockout", async () => {
    for (let index = 0; index < 11; index++)
      await login("real-admin@example.test", "Changed long password 456");
    expect((await db.query("SELECT * FROM login_attempts")).rows).toHaveLength(
      0,
    );
  });
  it("persists failed-login limits and blocks further attempts in the same window", async () => {
    for (let index = 0; index < 10; index++)
      await expect(
        login("missing@example.test", "Wrong password"),
      ).rejects.toMatchObject({ status: 401 });
    await expect(
      login("missing@example.test", "Wrong password"),
    ).rejects.toMatchObject({ status: 429 });
    expect(
      (
        await db.query<{ attempts: number }>(
          "SELECT attempts FROM login_attempts",
        )
      ).rows[0].attempts,
    ).toBe(11);
  });
  it("serializes an old-password login behind account rotation and rejects a revoked principal's token issuance", async () => {
    const email = "rotation-race@example.test";
    const startingPassword = "First rotation password 123";
    const oldPassword = "Current rotation password 456";
    const newPassword = "New rotation password 789";
    const user = await createUser(principal, {
      name: "Rotation user",
      email,
      password: startingPassword,
      role: "editor",
    });
    const initial = await login(email, startingPassword);
    const ready = await replaceAccount(await sessionPrincipal(initial.secret), {
      name: user.name,
      email,
      currentPassword: startingPassword,
      password: oldPassword,
    });
    const stale = await sessionPrincipal(ready.secret);
    const tokenBefore = await createToken(stale, {
      name: "Before rotation",
      scope: "write",
    });
    const blocker = await db.connect();
    let rotation: ReturnType<typeof replaceAccount> | undefined;
    let oldLogin: ReturnType<typeof login> | undefined;
    let outcomes:
      | Promise<PromiseSettledResult<Awaited<ReturnType<typeof login>>>[]>
      | undefined;
    let tokenOutcome:
      | Promise<PromiseSettledResult<Awaited<ReturnType<typeof createToken>>>[]>
      | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        user.id,
      ]);
      rotation = replaceAccount(stale, {
        name: user.name,
        email,
        currentPassword: oldPassword,
        password: newPassword,
      });
      // Hold the actual database lock until rotation is queued first, then
      // queue the old login behind it. No password implementation is mocked.
      await waitForBlockedQuery("SELECT * FROM users WHERE id=$1 FOR UPDATE");
      tokenOutcome = Promise.allSettled([
        createToken(stale, { name: "Queued across rotation", scope: "write" }),
      ]);
      await waitForBlockedQuery(
        "SELECT * FROM users WHERE id=$1 FOR UPDATE",
        2,
      );
      oldLogin = login(email, oldPassword);
      outcomes = Promise.allSettled([rotation, oldLogin]);
      await waitForBlockedQuery(
        "SELECT * FROM users WHERE email=$1 FOR UPDATE",
      );
      await blocker.query("COMMIT");
      const [rotated, old] = await outcomes;
      expect(rotated.status).toBe("fulfilled");
      expect(old.status).toBe("rejected");
      if (old.status === "rejected")
        expect(old.reason).toMatchObject({
          status: 401,
          code: "INVALID_CREDENTIALS",
        });
      const [issued] = await tokenOutcome;
      expect(issued.status).toBe("rejected");
      if (issued.status === "rejected")
        expect(issued.reason).toMatchObject({
          status: 401,
          code: "UNAUTHENTICATED",
        });
      expect(
        await findPrincipal(
          new Request("http://localhost/api", {
            headers: { cookie: `planroom_session=${ready.secret}` },
          }),
        ),
      ).toBeNull();
      expect(
        await findPrincipal(
          new Request("http://localhost/api/mcp", {
            headers: { authorization: `Bearer ${tokenBefore.token}` },
          }),
          true,
        ),
      ).toBeNull();
      await expect(
        createToken(stale, { name: "After revoked session", scope: "write" }),
      ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
      await expect(
        replaceAccount(stale, {
          name: user.name,
          email,
          currentPassword: newPassword,
          password: "Another rotation password 012",
        }),
      ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
      expect(
        (
          await db.query("SELECT secret_hash FROM sessions WHERE user_id=$1", [
            user.id,
          ])
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await db.query("SELECT id FROM api_tokens WHERE user_id=$1", [
            user.id,
          ])
        ).rows,
      ).toHaveLength(0);
      expect((await login(email, newPassword)).user.id).toBe(user.id);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      if (outcomes) await outcomes;
      else if (rotation) await Promise.allSettled([rotation]);
      if (tokenOutcome) await tokenOutcome;
    }
  });
  it("uses the real MCP client protocol across stateless requests and preserves scope/conflict errors", async () => {
    const endpoint = new URL(
      "/api/mcp",
      process.env.APP_URL ?? "http://localhost:3210",
    );
    const fetchRoute: FetchLike = async (url, init) => {
      const request = new Request(url, init);
      if (request.method === "POST") return mcpPost(request);
      if (request.method === "GET") return mcpGet();
      if (request.method === "DELETE") return mcpDelete();
      return new Response(null, { status: 405 });
    };
    const writerToken = await createToken(principal, {
      name: "MCP protocol writer",
      scope: "write",
    });
    const readerToken = await createToken(principal, {
      name: "MCP protocol reader",
      scope: "read",
    });
    const writer = new Client({
      name: "Planroom protocol integration",
      version: "1.0.0",
    });
    const reader = new Client({
      name: "Planroom readonly integration",
      version: "1.0.0",
    });
    const connect = (client: Client, token: string) =>
      client.connect(
        new StreamableHTTPClientTransport(endpoint, {
          fetch: fetchRoute,
          requestInit: { headers: { authorization: `Bearer ${token}` } },
        }),
      );
    try {
      await connect(writer, writerToken.token);
      expect(writer.getServerVersion()?.name).toBe("planroom");
      expect(
        (await writer.listTools()).tools.map((tool) => tool.name),
      ).toContain("update_document");
      const original = await createDocument(principal, content);
      const read = await writer.callTool({
        name: "read_document",
        arguments: { id: original.id },
      });
      const text = CallToolResultSchema.parse(read).content.find(
        (block) => block.type === "text",
      );
      if (!text || text.type !== "text")
        throw new Error("Expected document text");
      const parsed: unknown = JSON.parse(text.text);
      expect(
        z
          .object({ html: z.string(), currentRevision: z.number() })
          .parse(parsed),
      ).toEqual({ html: content.html, currentRevision: 1 });
      const update = {
        id: original.id,
        ...content,
        html: "<h1>MCP update</h1>",
        expectedRevision: 1,
        changeSummary: "Updated via MCP",
      };
      const saved = await writer.callTool({
        name: "update_document",
        arguments: update,
      });
      expect(saved.isError).not.toBe(true);
      expect((await getDocument(principal, original.id)).currentRevision).toBe(
        2,
      );
      const stale = await writer.callTool({
        name: "update_document",
        arguments: update,
      });
      expect(stale.isError).toBe(true);
      const errorText = CallToolResultSchema.parse(stale).content.find(
        (block) => block.type === "text",
      );
      if (!errorText || errorText.type !== "text")
        throw new Error("Expected conflict text");
      const errorValue: unknown = JSON.parse(errorText.text);
      expect(
        z
          .object({
            error: z.object({ code: z.string(), currentRevision: z.number() }),
          })
          .parse(errorValue),
      ).toEqual({ error: { code: "REVISION_CONFLICT", currentRevision: 2 } });
      await connect(reader, readerToken.token);
      const readerTools = (await reader.listTools()).tools.map(
        (tool) => tool.name,
      );
      expect(readerTools).toContain("read_document");
      expect(readerTools).not.toContain("update_document");
      expect(
        (
          await reader.callTool({
            name: "read_document",
            arguments: { id: original.id },
          })
        ).isError,
      ).not.toBe(true);
      expect(
        (
          await reader.callTool({
            name: "update_document",
            arguments: { ...update, expectedRevision: 2 },
          })
        ).isError,
      ).toBe(true);
      const batch = await mcpPost(
        new Request(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${writerToken.token}`,
            "Content-Type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify([
            { jsonrpc: "2.0", id: 1, method: "tools/list" },
          ]),
        }),
      );
      expect(batch.status).toBe(400);
      expect(await batch.json()).toMatchObject({
        error: { code: "BATCH_NOT_SUPPORTED" },
      });
    } finally {
      await writer.close();
      await reader.close();
      await deleteToken(principal, writerToken.record.id);
      await deleteToken(principal, readerToken.record.id);
    }
  });
});
