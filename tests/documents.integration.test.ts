import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { scrypt } from "node:crypto";
import { verifyPassword } from "../src/server/passwords";
import { db } from "../src/server/db";
import { migrate } from "../src/server/migrate";
import { seedBootstrap } from "../src/server/bootstrap";
import {
  createToken,
  listTokens,
  createUser,
  deleteToken,
  findPrincipal,
  login,
  replaceAccount,
  requirePrincipal,
  logout,
  secretHash,
  type Principal,
} from "../src/server/auth";
import {
  createDocument,
  getDocument,
  getRevision,
  listRevisions,
  restoreDocument,
  updateDocument,
  updateDocumentStatus,
  updateDocumentGitHubLinks,
  listDocuments,
  addComment,
  listComments,
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
  it("upgrades a legacy hash during successful login without changing the password or revoking existing credentials", async () => {
    const email = "legacy-upgrade@example.test";
    const startingPassword = "Legacy initial password 123";
    const password = "Legacy current password 456";
    const user = await createUser(principal, {
      name: "Legacy user",
      email,
      password: startingPassword,
      role: "editor",
    });
    const initial = await login(email, startingPassword);
    const ready = await replaceAccount(await sessionPrincipal(initial.secret), {
      name: user.name,
      email,
      currentPassword: startingPassword,
      password,
    });
    const identity = await sessionPrincipal(ready.secret);
    const key = await createToken(identity, {
      name: "Preserved legacy key",
      scope: "write",
    });
    const salt = "0123456789abcdef".repeat(2);
    const digest = await new Promise<Buffer>((resolve, reject) =>
      scrypt(
        password,
        salt,
        64,
        { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
        (error, value) => (error ? reject(error) : resolve(value)),
      ),
    );
    const legacy = `scrypt$${salt}$${digest.toString("hex")}`;
    await db.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
      user.id,
      legacy,
    ]);
    await expect(login(email, "Wrong password")).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
    expect(
      (
        await db.query<{ password_hash: string }>(
          "SELECT password_hash FROM users WHERE id=$1",
          [user.id],
        )
      ).rows[0].password_hash,
    ).toBe(legacy);
    const loggedIn = await login(email, password);
    expect(loggedIn.user).toEqual(identity.user);
    const upgraded = (
      await db.query<{ password_hash: string }>(
        "SELECT password_hash FROM users WHERE id=$1",
        [user.id],
      )
    ).rows[0].password_hash;
    expect(upgraded).toMatch(/^scrypt\$v2\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(await verifyPassword(password, upgraded)).toBe(true);
    expect((await sessionPrincipal(ready.secret)).user.id).toBe(user.id);
    expect((await sessionPrincipal(loggedIn.secret)).user.id).toBe(user.id);
    expect(
      (
        await requirePrincipal(
          new Request("http://localhost/api", {
            headers: { authorization: `Bearer ${key.token}` },
          }),
          { tokenOnly: true },
        )
      ).user.id,
    ).toBe(user.id);
    expect(
      (
        await db.query("SELECT secret_hash FROM sessions WHERE user_id=$1", [
          user.id,
        ])
      ).rows,
    ).toHaveLength(2);
    expect(
      (await db.query("SELECT id FROM api_tokens WHERE user_id=$1", [user.id]))
        .rows,
    ).toEqual([{ id: key.record.id }]);
    await login(email, password);
    expect(
      (
        await db.query<{ password_hash: string }>(
          "SELECT password_hash FROM users WHERE id=$1",
          [user.id],
        )
      ).rows[0].password_hash,
    ).toBe(upgraded);
    await deleteToken(identity, key.record.id);
  });
  it("uses case-insensitive bearer identity without falling back to a stronger cookie session", async () => {
    const account = await login(
      "real-admin@example.test",
      "Changed long password 456",
    );
    const cookie = `planroom_session=${account.secret}`;
    const key = await createToken(principal, {
      name: "Bearer precedence",
      scope: "read",
    });
    expect(
      (
        await requirePrincipal(
          new Request("http://localhost/api", { headers: { cookie } }),
        )
      ).authentication,
    ).toBe("session");
    for (const scheme of ["bearer", "bEaReR"]) {
      const request = new Request("http://localhost/api", {
        headers: { cookie, authorization: `${scheme} ${key.token}` },
      });
      const identity = await requirePrincipal(request);
      expect(identity.authentication).toBe("token");
      expect(identity.scope).toBe("read");
      await expect(
        requirePrincipal(request, { write: true }),
      ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
      await expect(createDocument(identity, content)).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN",
      });
    }
    for (const authorization of [
      "",
      "Basic synthetic",
      "Bearer",
      "Bearer not-a-valid-key",
      "bearer not-a-valid-key",
      `Other ${key.token}`,
    ]) {
      const request = new Request("http://localhost/api", {
        headers: { cookie, authorization },
      });
      expect(await findPrincipal(request)).toBeNull();
      await expect(requirePrincipal(request)).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHENTICATED",
      });
    }
    await deleteToken(principal, key.record.id);
  });
  it("allows one concurrent update, rolls back the loser, and restores into a new revision", async () => {
    const original = await createDocument(principal, content);
    const results = await Promise.allSettled([
      updateDocument(principal, original.id, {
        ...content,
        html: "<p>Writer A</p>",
        changeSummary: "A",
        expectedVersion: 1,
      }),
      updateDocument(principal, original.id, {
        ...content,
        html: "<p>Writer B</p>",
        changeSummary: "B",
        expectedVersion: 1,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    if (!rejection || rejection.status !== "rejected")
      throw new Error("Expected one conflict");
    expect(rejection.reason).toMatchObject({ status: 409, currentVersion: 2 });
    expect(
      (await listRevisions(principal, original.id)).map(
        (revision) => revision.number,
      ),
    ).toEqual([2, 1]);
    await expect(
      restoreDocument(principal, original.id, 999, {
        expectedVersion: 2,
        changeSummary: "Missing",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await getDocument(principal, original.id)).currentRevision).toBe(2);
    expect(
      await restoreDocument(principal, original.id, 1, {
        expectedVersion: 2,
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
  it("saves metadata without duplicating HTML and keeps concurrent metadata edits conflict-safe", async () => {
    const original = await createDocument(principal, content);
    const changed = await updateDocument(principal, original.id, {
      ...content,
      title: "Renamed plan",
      description: "More context",
      instructions: "Updated guidance",
      expectedVersion: original.version,
    });
    expect(changed).toMatchObject({
      currentRevision: 1,
      version: 2,
      title: "Renamed plan",
      instructions: "Updated guidance",
      html: content.html,
    });
    expect(await listRevisions(principal, original.id)).toHaveLength(1);
    expect(await getRevision(principal, original.id, 1)).toMatchObject({
      title: content.title,
      instructions: content.instructions,
    });
    const identical = await updateDocument(principal, original.id, {
      ...changed,
      changeSummary: "Only a summary",
      expectedVersion: changed.version,
    });
    expect(identical).toEqual(changed);
    const results = await Promise.allSettled([
      updateDocumentStatus(principal, original.id, {
        status: "active",
        expectedVersion: 2,
      }),
      updateDocument(principal, original.id, {
        ...changed,
        title: "Concurrent rename",
        changeSummary: "Rename",
        expectedVersion: 2,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (!rejected || rejected.status !== "rejected")
      throw new Error("Expected a metadata conflict");
    expect(rejected.reason).toMatchObject({
      code: "DOCUMENT_CONFLICT",
      currentVersion: 3,
    });
    expect(await listRevisions(principal, original.id)).toHaveLength(1);
    const latest = await getDocument(principal, original.id);
    const revised = await updateDocument(principal, original.id, {
      ...latest,
      html: latest.html + "\n",
      changeSummary: "Source changed",
      expectedVersion: latest.version,
    });
    expect(revised).toMatchObject({ currentRevision: 2, version: 4 });
    expect(await getRevision(principal, original.id, 2)).toMatchObject({
      title: latest.title,
      instructions: latest.instructions,
      html: latest.html + "\n",
    });
  });
  it.each(["ready", "in_development", "completed", "archived"] as const)(
    "freezes content in %s without a revision, retains references and requires explicit reopening",
    async (status) => {
      const original = await createDocument(principal, content);
      const frozen = await updateDocumentStatus(principal, original.id, {
        status,
        expectedVersion: 1,
      });
      expect(frozen).toMatchObject({ status, currentRevision: 1, version: 2 });
      expect(frozen).not.toHaveProperty("html");
      await expect(
        updateDocument(principal, original.id, {
          ...content,
          status: "draft",
          html: "<p>Must not overwrite</p>",
          expectedVersion: 2,
        }),
      ).rejects.toMatchObject({ code: "DOCUMENT_LOCKED", currentRevision: 1 });
      await expect(
        restoreDocument(principal, original.id, 1, {
          expectedVersion: 2,
          changeSummary: "Must not bypass freeze",
        }),
      ).rejects.toMatchObject({ code: "DOCUMENT_LOCKED" });
      const discussion = await addComment(principal, original.id, {
        body: "Implementation discussion",
      });
      expect(await listComments(principal, original.id)).toContainEqual(
        discussion,
      );
      const githubLinks = ["https://github.com/eneo-ai/planroom/pull/12"];
      const linked = await updateDocumentGitHubLinks(principal, original.id, {
        githubLinks,
        expectedLinksVersion: 1,
      });
      expect(linked).toEqual({ githubLinks, githubLinksVersion: 2 });
      expect(
        (await listDocuments(principal, { status })).find(
          (item) => item.id === original.id,
        )?.githubLinks,
      ).toEqual(githubLinks);
      expect(await getDocument(principal, original.id)).toMatchObject({
        status,
        currentRevision: 1,
        version: 2,
        html: original.html,
        updatedAt: frozen.updatedAt,
        authorName: frozen.authorName,
      });
      const reopened = await updateDocumentStatus(principal, original.id, {
        status: "active",
        expectedVersion: 2,
      });
      expect(reopened).toMatchObject({
        currentRevision: 1,
        version: 3,
        githubLinks,
      });
      const identicalStatus = await updateDocumentStatus(
        principal,
        original.id,
        { status: "active", expectedVersion: 3 },
      );
      expect(identicalStatus).toEqual(reopened);
      const edited = await updateDocument(principal, original.id, {
        ...content,
        status: "active",
        html: "<p>New scope</p>",
        expectedVersion: 3,
      });
      expect(edited).toMatchObject({
        currentRevision: 2,
        version: 4,
        githubLinks,
      });
      expect((await getRevision(principal, original.id, 1)).html).toBe(
        original.html,
      );
      expect(await listRevisions(principal, original.id)).toHaveLength(2);
    },
  );
  it("allows independent status/reference races without overwriting either", async () => {
    const original = await createDocument(principal, content);
    const githubLinks = ["https://github.com/eneo-ai/planroom/issues/99"];
    const results = await Promise.allSettled([
      updateDocumentStatus(principal, original.id, {
        status: "ready",
        expectedVersion: 1,
      }),
      updateDocumentGitHubLinks(principal, original.id, {
        githubLinks,
        expectedLinksVersion: 1,
      }),
    ]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await getDocument(principal, original.id)).toMatchObject({
      status: "ready",
      currentRevision: 1,
      version: 2,
      githubLinksVersion: 2,
      githubLinks,
      html: content.html,
    });
    expect(await listRevisions(principal, original.id)).toHaveLength(1);
  });
  it("rejects competing link replacements and avoids advancing identical links", async () => {
    const original = await createDocument(principal, content);
    const results = await Promise.allSettled(
      [7, 8].map((number) =>
        updateDocumentGitHubLinks(principal, original.id, {
          githubLinks: [`https://github.com/eneo-ai/planroom/issues/${number}`],
          expectedLinksVersion: 1,
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (!rejected || rejected.status !== "rejected")
      throw new Error("Expected a link conflict");
    expect(rejected.reason).toMatchObject({ code: "GITHUB_LINKS_CONFLICT" });
    const linked = await getDocument(principal, original.id);
    expect(
      await updateDocumentGitHubLinks(principal, original.id, {
        githubLinks: linked.githubLinks,
        expectedLinksVersion: 2,
      }),
    ).toEqual({ githubLinks: linked.githubLinks, githubLinksVersion: 2 });
    expect(linked).toMatchObject({
      currentRevision: 1,
      version: 1,
      updatedAt: original.updatedAt,
      authorName: original.authorName,
    });
  });
  it("preserves current references during content writes and restores, including an identical HTML restore", async () => {
    const original = await createDocument(principal, content);
    const githubLinks = ["https://github.com/eneo-ai/planroom/issues/7"];
    await updateDocumentGitHubLinks(principal, original.id, {
      githubLinks,
      expectedLinksVersion: 1,
    });
    const edited = await updateDocument(principal, original.id, {
      ...content,
      html: "<p>Updated</p>",
      expectedVersion: 1,
    });
    expect(edited.githubLinks).toEqual(githubLinks);
    expect((await getRevision(principal, original.id, 2)).githubLinks).toEqual(
      githubLinks,
    );
    await updateDocumentGitHubLinks(principal, original.id, {
      githubLinks: [],
      expectedLinksVersion: 2,
    });
    const restored = await restoreDocument(principal, original.id, 1, {
      expectedVersion: 2,
      changeSummary: "Restore original",
    });
    expect(restored).toMatchObject({
      currentRevision: 3,
      version: 3,
      html: original.html,
      githubLinks: [],
    });
    const renamed = await updateDocument(principal, original.id, {
      ...restored,
      title: "Rename",
      expectedVersion: 3,
    });
    expect(renamed).toMatchObject({ currentRevision: 3, version: 4 });
    const metadataRestored = await restoreDocument(principal, original.id, 1, {
      expectedVersion: 4,
      changeSummary: "Restore metadata",
    });
    expect(metadataRestored).toMatchObject({
      currentRevision: 3,
      version: 5,
      title: content.title,
      githubLinks: [],
    });
    expect(await listRevisions(principal, original.id)).toHaveLength(3);
    const noopRestore = await restoreDocument(principal, original.id, 1, {
      expectedVersion: 5,
      changeSummary: "Already identical",
    });
    expect(noopRestore).toEqual(metadataRestored);
  });
  it("enforces read scope and viewer permissions for metadata operations", async () => {
    const original = await createDocument(principal, content);
    for (const identity of [
      { ...principal, scope: "read" as const },
      { ...principal, user: { ...principal.user, role: "viewer" as const } },
    ]) {
      await expect(
        updateDocumentStatus(identity, original.id, {
          status: "ready",
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        updateDocumentGitHubLinks(identity, original.id, {
          githubLinks: [],
          expectedLinksVersion: 1,
        }),
      ).rejects.toMatchObject({ status: 403 });
    }
    expect((await getDocument(principal, original.id)).currentRevision).toBe(1);
  });
  it("persists just the last four key characters and never lists the complete secret", async () => {
    const created = await createToken(principal, {
      name: "Suffix identification",
      scope: "read",
    });
    expect(created.record.maskedToken).toBe(
      `********${created.token.slice(-4)}`,
    );
    const stored = await db.query<{
      secret_hash: string;
      token_suffix: string;
    }>("SELECT secret_hash,token_suffix FROM api_tokens WHERE id=$1", [
      created.record.id,
    ]);
    expect(stored.rows[0]).toEqual({
      secret_hash: secretHash(created.token),
      token_suffix: created.token.slice(-4),
    });
    const listed = await listTokens(principal);
    expect(listed.find((token) => token.id === created.record.id)).toEqual(
      created.record,
    );
    expect(JSON.stringify(listed)).not.toContain(created.token);
    expect(JSON.stringify(listed)).not.toContain(secretHash(created.token));
    // Migrated historical keys have no suffix: hashes cannot reconstruct it.
    await db.query("UPDATE api_tokens SET token_suffix=NULL WHERE id=$1", [
      created.record.id,
    ]);
    expect(
      (await listTokens(principal)).find(
        (token) => token.id === created.record.id,
      )?.maskedToken,
    ).toBeNull();
    await deleteToken(principal, created.record.id);
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
    expect(
      (
        await db.query("SELECT * FROM login_attempts WHERE subject_hash=$1", [
          secretHash("real-admin@example.test"),
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("persists failed-login limits and blocks further attempts in the same window", async () => {
    for (let index = 0; index < 5; index++)
      await expect(
        login("missing@example.test", "Wrong password"),
      ).rejects.toMatchObject({ status: 401 });
    await expect(
      login("missing@example.test", "Wrong password"),
    ).rejects.toMatchObject({ status: 429 });
    expect(
      (
        await db.query<{ attempts: number }>(
          "SELECT attempts FROM login_attempts WHERE subject_hash=$1",
          [secretHash("missing@example.test")],
        )
      ).rows[0].attempts,
    ).toBe(5);
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
        expectedVersion: 1,
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
            error: z.object({ code: z.string(), currentVersion: z.number() }),
          })
          .parse(errorValue),
      ).toEqual({ error: { code: "DOCUMENT_CONFLICT", currentVersion: 2 } });
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
            arguments: { ...update, expectedVersion: 2 },
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
  it("rejects previously authenticated but revoked tokens and sessions for every document write", async () => {
    const document = await createDocument(principal, content);
    const baseline = (
      await db.query<{ count: string }>("SELECT count(*) FROM documents")
    ).rows[0].count;
    const key = await createToken(principal, {
      name: "Revoked write regression",
      scope: "write",
    });
    const tokenPrincipal = await requirePrincipal(
      new Request("http://localhost/api/mcp", {
        headers: { authorization: `Bearer ${key.token}` },
      }),
      { tokenOnly: true },
    );
    await deleteToken(principal, key.record.id);
    const account = await login(
      "real-admin@example.test",
      "Changed long password 456",
    );
    const cachedSession = await sessionPrincipal(account.secret);
    await logout(
      new Request("http://localhost/api/auth/logout", {
        headers: { cookie: `planroom_session=${account.secret}` },
      }),
    );
    for (const identity of [tokenPrincipal, cachedSession]) {
      await expect(createDocument(identity, content)).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHENTICATED",
      });
      await expect(
        updateDocument(identity, document.id, {
          ...content,
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
      await expect(
        restoreDocument(identity, document.id, 1, {
          expectedVersion: 1,
          changeSummary: "Not authorized",
        }),
      ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
      await expect(
        addComment(identity, document.id, { body: "Must not be saved" }),
      ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    }
    expect(
      (await db.query<{ count: string }>("SELECT count(*) FROM documents"))
        .rows[0].count,
    ).toBe(baseline);
    expect(await listRevisions(principal, document.id)).toHaveLength(1);
    expect(await listComments(principal, document.id)).toEqual([]);
  });
  it("uses the current role and scope when a write reaches its transaction", async () => {
    const document = await createDocument(principal, content);
    const key = await createToken(principal, {
      name: "Changed privilege regression",
      scope: "write",
    });
    const cached = await requirePrincipal(
      new Request("http://localhost/api/mcp", {
        headers: { authorization: `Bearer ${key.token}` },
      }),
      { tokenOnly: true },
    );
    await db.query("UPDATE api_tokens SET scope='read' WHERE id=$1", [
      key.record.id,
    ]);
    await expect(
      updateDocument(cached, document.id, { ...content, expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await db.query("UPDATE api_tokens SET scope='write' WHERE id=$1", [
      key.record.id,
    ]);
    await db.query("UPDATE users SET role='viewer' WHERE id=$1", [
      principal.user.id,
    ]);
    try {
      await expect(
        addComment(cached, document.id, {
          body: "Old role must not authorize",
        }),
      ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    } finally {
      await db.query("UPDATE users SET role='admin' WHERE id=$1", [
        principal.user.id,
      ]);
    }
    expect(await listRevisions(principal, document.id)).toHaveLength(1);
    expect(await listComments(principal, document.id)).toEqual([]);
    await deleteToken(principal, key.record.id);
  });
  it("orders token issuance before logout or rejects it after the session has ended", async () => {
    const account = await login(
      "real-admin@example.test",
      "Changed long password 456",
    );
    const identity = await sessionPrincipal(account.secret);
    const blocker = await db.connect();
    let issued: ReturnType<typeof createToken> | undefined;
    let loggedOut: ReturnType<typeof logout> | undefined;
    let outcomes: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("LOCK TABLE api_tokens IN ACCESS EXCLUSIVE MODE");
      issued = createToken(identity, {
        name: "Logout race regression",
        scope: "read",
      });
      await waitForBlockedQuery(
        "INSERT INTO api_tokens(id,user_id,name,scope,secret_hash,token_suffix) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,scope,created_at,last_used_at,expires_at,token_suffix",
      );
      loggedOut = logout(
        new Request("http://localhost/api/auth/logout", {
          headers: { cookie: `planroom_session=${account.secret}` },
        }),
      );
      outcomes = Promise.allSettled([issued, loggedOut]);
      await waitForBlockedQuery("SELECT id FROM users WHERE id=$1 FOR UPDATE");
      await blocker.query("COMMIT");
      await outcomes;
      const result = await issued;
      expect(
        await findPrincipal(
          new Request("http://localhost/api", {
            headers: { cookie: `planroom_session=${account.secret}` },
          }),
        ),
      ).toBeNull();
      await expect(
        createToken(identity, { name: "After logout", scope: "read" }),
      ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
      await deleteToken(principal, result.record.id);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      if (outcomes) await outcomes;
      else if (issued) await Promise.allSettled([issued]);
    }
  });
  it("locks a real account for ten full minutes starting at its fifth failure, and resets after recovery", async () => {
    const email = "lockout-policy@example.test";
    const password = "Valid lockout password 123";
    await createUser(principal, {
      name: "Lockout regression",
      email,
      password,
      role: "viewer",
    });
    for (let index = 0; index < 4; index++)
      await expect(login(email, "Wrong password")).rejects.toMatchObject({
        status: 401,
      });
    await db.query(
      "UPDATE login_attempts SET window_start=now()-interval '9 minutes' WHERE subject_hash=$1",
      [secretHash(email)],
    );
    await expect(login(email, "Wrong password")).rejects.toMatchObject({
      status: 401,
    });
    const fifth = (
      await db.query<{ attempts: number; recent: boolean }>(
        "SELECT attempts, window_start>now()-interval '5 seconds' AS recent FROM login_attempts WHERE subject_hash=$1",
        [secretHash(email)],
      )
    ).rows[0];
    expect(fifth).toEqual({ attempts: 5, recent: true });
    await expect(login(email, password)).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
    });
    await db.query(
      "UPDATE login_attempts SET window_start=now()-interval '9 minutes 59 seconds' WHERE subject_hash=$1",
      [secretHash(email)],
    );
    await expect(login(email, password)).rejects.toMatchObject({ status: 429 });
    await db.query(
      "UPDATE login_attempts SET window_start=now()-interval '10 minutes 1 second' WHERE subject_hash=$1",
      [secretHash(email)],
    );
    expect((await login(email, password)).user.email).toBe(email);
    expect(
      (
        await db.query(
          "SELECT subject_hash FROM login_attempts WHERE subject_hash=$1",
          [secretHash(email)],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(login(email, "Wrong password")).rejects.toMatchObject({
      status: 401,
    });
    expect(
      (
        await db.query<{ attempts: number }>(
          "SELECT attempts FROM login_attempts WHERE subject_hash=$1",
          [secretHash(email)],
        )
      ).rows[0].attempts,
    ).toBe(1);
    await login(email, password);
  });
  it("counts concurrent failures serially and stops verification after exactly five", async () => {
    const email = "concurrent-lockout@example.test";
    await expect(login(email, "Wrong password")).rejects.toMatchObject({
      status: 401,
    });
    const failures = await Promise.allSettled(
      Array.from({ length: 4 }, () => login(email, "Wrong password")),
    );
    for (const failure of failures) {
      expect(failure.status).toBe("rejected");
      if (failure.status === "rejected")
        expect(failure.reason).toMatchObject({ status: 401 });
    }
    await expect(login(email, "Wrong password")).rejects.toMatchObject({
      status: 429,
    });
    expect(
      (
        await db.query<{ attempts: number }>(
          "SELECT attempts FROM login_attempts WHERE subject_hash=$1",
          [secretHash(email)],
        )
      ).rows[0].attempts,
    ).toBe(5);
  });
  it("expires API keys after ninety days and rejects a cached key from all document writes", async () => {
    const key = await createToken(principal, {
      name: "Expiry regression",
      scope: "write",
    });
    const expiresAt = Date.parse(key.record.expiresAt);
    expect(expiresAt - Date.parse(key.record.createdAt)).toBe(
      90 * 24 * 60 * 60 * 1000,
    );
    const request = new Request("http://localhost/api", {
      headers: { authorization: `Bearer ${key.token}` },
    });
    const cached = await requirePrincipal(request, { tokenOnly: true });
    const document = await createDocument(principal, content);
    const before = (await db.query("SELECT id FROM documents")).rows.length;
    await db.query(
      "UPDATE api_tokens SET expires_at=now()-interval '1 second' WHERE id=$1",
      [key.record.id],
    );
    expect(await findPrincipal(request, true)).toBeNull();
    const operations = [
      () => createDocument(cached, content),
      () =>
        updateDocument(cached, document.id, {
          ...content,
          expectedVersion: 1,
        }),
      () =>
        restoreDocument(cached, document.id, 1, {
          expectedVersion: 1,
          changeSummary: "Expired key restore",
        }),
      () => addComment(cached, document.id, { body: "Expired key comment" }),
    ];
    for (const operation of operations)
      await expect(operation()).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHENTICATED",
      });
    expect((await db.query("SELECT id FROM documents")).rows).toHaveLength(
      before,
    );
    expect(await listRevisions(principal, document.id)).toHaveLength(1);
    expect(await listComments(principal, document.id)).toEqual([]);
    await deleteToken(principal, key.record.id);
  });
  it("migrates latest metadata and references without rewriting existing HTML history", async () => {
    const client = await db.connect();
    const id = "a26a8dca-9632-4d15-898e-17d2f2e99b18";
    try {
      await client.query("BEGIN");
      await client.query("CREATE SCHEMA metadata_migration_test");
      await client.query("SET LOCAL search_path TO metadata_migration_test");
      for (const name of ["001_initial.sql", "003_planning_lifecycle.sql"])
        await client.query(
          await readFile(resolve(process.cwd(), "migrations", name), "utf8"),
        );
      await client.query(
        "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Author','author@example.test','not-a-real-hash','editor')",
        [principal.user.id],
      );
      await client.query(
        "INSERT INTO documents(id,current_revision) VALUES($1,2)",
        [id],
      );
      await client.query(
        "INSERT INTO document_revisions(id,document_id,number,title,description,html,instructions,status,change_summary,author_id,github_links) VALUES($1,$2,1,'Old','Old description','<p>Original</p>','Old instructions','draft','First',$3,'{}'),($4,$2,2,'Current','Current description','<p>Current</p>','Current instructions','ready','Latest',$3,ARRAY['https://github.com/eneo-ai/planroom/pull/8'])",
        [
          "ab294e09-38d6-4356-864a-8e169cf6a201",
          id,
          principal.user.id,
          "ab294e09-38d6-4356-864a-8e169cf6a202",
        ],
      );
      await client.query(
        await readFile(
          resolve(process.cwd(), "migrations/005_document_metadata.sql"),
          "utf8",
        ),
      );
      const current = (
        await client.query(
          "SELECT title,description,instructions,status,github_links,version,github_links_version,current_revision FROM documents WHERE id=$1",
          [id],
        )
      ).rows[0];
      expect(current).toEqual({
        title: "Current",
        description: "Current description",
        instructions: "Current instructions",
        status: "ready",
        github_links: ["https://github.com/eneo-ai/planroom/pull/8"],
        version: 1,
        github_links_version: 1,
        current_revision: 2,
      });
      expect(
        (
          await client.query(
            "SELECT number,html,title FROM document_revisions ORDER BY number",
          )
        ).rows,
      ).toEqual([
        { number: 1, html: "<p>Original</p>", title: "Old" },
        { number: 2, html: "<p>Current</p>", title: "Current" },
      ]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
  it("backfills key lifetime without immediately revoking preexisting old keys", async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "CREATE TEMP TABLE api_tokens(created_at timestamptz NOT NULL)",
      );
      await client.query(
        "INSERT INTO api_tokens(created_at) VALUES(now()-interval '120 days'),(now()-interval '1 day')",
      );
      await client.query(
        await readFile(
          resolve(process.cwd(), "migrations/002_token_expiry.sql"),
          "utf8",
        ),
      );
      const rows = (
        await client.query<{ lifetime_days: string }>(
          "SELECT extract(epoch from(expires_at-now()))/86400 AS lifetime_days FROM api_tokens ORDER BY created_at",
        )
      ).rows;
      expect(Number(rows[0].lifetime_days)).toBe(90);
      expect(Number(rows[1].lifetime_days)).toBe(89);
      await client.query("INSERT INTO api_tokens(created_at) VALUES(now())");
      expect(
        (
          await client.query<{ valid: boolean }>(
            "SELECT expires_at=now()+interval '90 days' AS valid FROM api_tokens ORDER BY created_at DESC LIMIT 1",
          )
        ).rows[0].valid,
      ).toBe(true);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
  it("rejects excess concurrent logins without queueing expensive work", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) =>
        login(
          `concurrent-security-${index}@example.test`,
          "Not a valid password",
        ),
      ),
    );
    expect(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof AppError &&
          result.reason.code === "AUTH_BUSY",
      ),
    ).toHaveLength(1);
    expect(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof AppError &&
          result.reason.code === "INVALID_CREDENTIALS",
      ),
    ).toHaveLength(4);
    expect(
      (await login("real-admin@example.test", "Changed long password 456")).user
        .id,
    ).toBe(principal.user.id);
  });
  it("denies a streamed MCP read if the real API key is revoked or expires while its body is being read", async () => {
    const document = await createDocument(principal, content);
    const endpoint = new URL(
      "/api/mcp",
      process.env.APP_URL ?? "http://localhost:3210",
    );
    for (const invalidation of ["revoke", "expire"] as const) {
      const key = await createToken(principal, {
        name: `Slow read ${invalidation}`,
        scope: "read",
      });
      let markBodyReading: (() => void) | undefined;
      const bodyReading = new Promise<void>((resolve) => {
        markBodyReading = resolve;
      });
      let bodyController:
        ReadableStreamDefaultController<Uint8Array> | undefined;
      const stream = new ReadableStream<Uint8Array>(
        {
          start(controller) {
            bodyController = controller;
          },
          pull() {
            markBodyReading?.();
          },
        },
        { highWaterMark: 0 },
      );
      const abort = new AbortController();
      const init: RequestInit & { duplex: "half" } = {
        method: "POST",
        body: stream,
        duplex: "half",
        signal: abort.signal,
        headers: {
          authorization: `Bearer ${key.token}`,
          host: endpoint.host,
          "Content-Type": "application/json",
          accept: "application/json, text/event-stream",
        },
      };
      const pending = mcpPost(new Request(endpoint, init));
      try {
        await Promise.race([
          bodyReading,
          pending.then(() => {
            throw new Error("MCP request returned before the body was read");
          }),
        ]);
        if (invalidation === "revoke")
          await deleteToken(principal, key.record.id);
        else
          await db.query(
            "UPDATE api_tokens SET expires_at=now()-interval '1 second' WHERE id=$1",
            [key.record.id],
          );
        if (!bodyController)
          throw new Error("Expected pending MCP body controller");
        bodyController.enqueue(
          new TextEncoder().encode(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: { name: "read_document", arguments: { id: document.id } },
            }),
          ),
        );
        bodyController.close();
        const response = await pending;
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
          error: {
            code: "UNAUTHENTICATED",
            message: "Logga in för att fortsätta.",
          },
        });
      } finally {
        abort.abort();
        await pending;
        await deleteToken(principal, key.record.id);
      }
    }
  });
  it("bounds unique-email abuse globally without creating rows after the budget and recovers after its short window", async () => {
    // This suite owns an isolated disposable database. Clear previous test
    // counters so the public60/minute policy can be exercised in full.
    await db.query("DELETE FROM login_attempts");
    for (let index = 0; index < 60; index++)
      await expect(
        login(
          `rotating-security-${index}@example.test`,
          "Not a valid password",
        ),
      ).rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" });
    expect(
      (await db.query("SELECT subject_hash FROM login_attempts")).rows,
    ).toHaveLength(61);
    for (let index = 60; index < 65; index++)
      await expect(
        login(
          `rotating-security-${index}@example.test`,
          "Not a valid password",
        ),
      ).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    expect(
      (await db.query("SELECT subject_hash FROM login_attempts")).rows,
    ).toHaveLength(61);
    await db.query(
      "UPDATE login_attempts SET window_start=now()-interval '61 seconds' WHERE subject_hash=$1",
      [secretHash("login:global")],
    );
    expect(
      (await login("real-admin@example.test", "Changed long password 456")).user
        .id,
    ).toBe(principal.user.id);
  }, 30_000);
});
