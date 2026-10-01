import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { scrypt, type ScryptOptions } from "node:crypto";
import {
  hashPassword,
  verifyLoginPassword,
  verifyPassword,
} from "../src/server/passwords";
import { api, readJson, revisionNumber, uuid } from "../src/server/http";
import { AppError } from "../src/server/errors";
import { assertSameOrigin, sessionCookie } from "../src/server/auth";

function referenceScrypt(
  password: string,
  salt: string,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

describe("password protection", () => {
  it("salts equal passwords independently and accepts only the matching password", async () => {
    const password = "An actual long passphrase";
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^scrypt\$v2\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(first).not.toContain(password);
    const [, , salt, digest] = first.split("$");
    expect(
      (
        await referenceScrypt(password, salt, {
          N: 32768,
          r: 8,
          p: 3,
          maxmem: 64 * 1024 * 1024,
        })
      ).toString("hex"),
    ).toBe(digest);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword("wrong password", first)).toBe(false);
    expect(await verifyPassword(password, "scrypt$broken$00")).toBe(false);
  });
  it("reads only the persisted legacy format and upgrades a matching password to v2", async () => {
    const password = "Legacy compatible password 123";
    const salt = "0123456789abcdef".repeat(2);
    const digest = (
      await referenceScrypt(password, salt, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      })
    ).toString("hex");
    const legacy = `scrypt$${salt}$${digest}`;
    expect(await verifyPassword(password, legacy)).toBe(true);
    expect(await verifyLoginPassword("Wrong password", legacy)).toEqual({
      matches: false,
    });
    const upgraded = await verifyLoginPassword(password, legacy);
    expect(upgraded.matches).toBe(true);
    if (!upgraded.matches || !upgraded.upgradedHash)
      throw new Error("Expected a verified legacy password to be upgraded");
    expect(upgraded.upgradedHash).toMatch(
      /^scrypt\$v2\$[a-f0-9]{32}\$[a-f0-9]{128}$/,
    );
    expect(await verifyPassword(password, upgraded.upgradedHash)).toBe(true);
    expect(await verifyLoginPassword(password, upgraded.upgradedHash)).toEqual({
      matches: true,
      upgradedHash: null,
    });
  });
  it("rejects malformed hashes, unsupported versions and extra cost or trailing fields", async () => {
    const password = "Strict format password 123";
    const current = await hashPassword(password);
    const [, , salt, digest] = current.split("$");
    const malformed = [
      "",
      "scrypt$broken$00",
      `${current}$extra`,
      `scrypt$v3$${salt}$${digest}`,
      `scrypt$v1$${salt}$${digest}`,
      `scrypt$v2$32768$${salt}$${digest}`,
      `scrypt$16384$${salt}$${digest}`,
      `scrypt$v2$${salt.slice(1)}$${digest}`,
      `scrypt$v2$${salt}0$${digest}`,
      `scrypt$v2$${"z".repeat(32)}$${digest}`,
      `scrypt$v2$${salt}$${digest.slice(1)}`,
      `scrypt$v2$${salt}$${digest}0`,
      `scrypt$v2$${salt}$${"z".repeat(128)}`,
      `scrypt$${salt.slice(1)}$${digest}`,
      `scrypt$${salt}$${digest}$extra`,
      `scrypt$${"z".repeat(32)}$${digest}`,
      `scrypt$${salt}$${digest.slice(1)}`,
      `scrypt$v2$${salt}\n$${digest}`,
      `scrypt$v2$${salt}$${digest}\n`,
      `scrypt$${salt}\n$${digest}`,
      `scrypt$${salt}$${digest}\n`,
    ];
    for (const stored of malformed) {
      expect(await verifyPassword(password, stored)).toBe(false);
      expect(await verifyLoginPassword(password, stored)).toEqual({
        matches: false,
      });
    }
  });
  it("unknown users share the bounded derivation budget and cannot authenticate", async () => {
    const unknown = Promise.all(
      Array.from({ length: 4 }, () =>
        verifyLoginPassword("Unknown user password", null),
      ),
    );
    try {
      await expect(hashPassword("Excess password work")).rejects.toMatchObject({
        status: 429,
        code: "AUTH_BUSY",
      });
      expect(await unknown).toEqual(
        Array.from({ length: 4 }, () => ({ matches: false })),
      );
    } finally {
      await unknown;
    }
  });
  it("rejects excess concurrent password work instead of queuing it", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => hashPassword("Concurrent password work")),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(4);
    const rejected = results.find((result) => result.status === "rejected");
    if (!rejected || rejected.status !== "rejected")
      throw new Error("Expected excess password work to be rejected");
    expect(rejected.reason).toMatchObject({ status: 429, code: "AUTH_BUSY" });
    expect(
      await verifyPassword(
        "Concurrent password work",
        await hashPassword("Concurrent password work"),
      ),
    ).toBe(true);
  });
});
describe("HTTP input boundaries", () => {
  it("sets Secure for parsed HTTPS URLs including mixed-case schemes", () => {
    const original = process.env.APP_URL;
    try {
      for (const url of [
        "https://plans.example.test",
        "HTTPS://plans.example.test",
      ]) {
        process.env.APP_URL = url;
        expect(sessionCookie("synthetic-session")).toContain("; Secure");
        expect(sessionCookie("synthetic-session")).not.toContain(url);
      }
      process.env.APP_URL = "http://localhost:3210";
      expect(sessionCookie("synthetic-session")).not.toContain("; Secure");
      expect(sessionCookie("synthetic-session")).toContain(
        "HttpOnly; Path=/; SameSite=Lax",
      );
    } finally {
      if (original === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = original;
    }
  });
  it("cancels stalled streamed bodies after the bounded read deadline", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"title":'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    };
    try {
      const pending = readJson(
        new Request("https://planroom.test/api/auth/login", init),
        z.unknown(),
      );
      const expected = expect(pending).rejects.toMatchObject({
        status: 408,
        code: "BODY_TIMEOUT",
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await expected;
      expect(cancelled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("cancels reads when the caller aborts and preserves highly fragmented valid JSON", async () => {
    const abort = new AbortController();
    let cancelled = false;
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      duplex: "half",
      body: new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      }),
    };
    const pending = readJson(
      new Request("https://planroom.test/api/documents", init),
      z.unknown(),
    );
    const rejected = expect(pending).rejects.toMatchObject({
      status: 400,
      code: "REQUEST_ABORTED",
    });
    abort.abort();
    await rejected;
    expect(cancelled).toBe(true);
    const expected = { value: "x".repeat(9000) };
    const bytes = new TextEncoder().encode(JSON.stringify(expected));
    let offset = 0;
    const fragmented: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      duplex: "half",
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset < bytes.length)
            controller.enqueue(bytes.subarray(offset, ++offset));
          else controller.close();
        },
      }),
    };
    expect(
      await readJson(
        new Request("https://planroom.test/api/documents", fragmented),
        z.object({ value: z.string() }),
      ),
    ).toEqual(expected);
  });
  it("rejects an oversized streamed request before parsing its JSON", async () => {
    const request = new Request("https://planroom.test/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '"' + "x".repeat(3 * 1024 * 1024) + '"',
    });
    await expect(readJson(request, z.string())).rejects.toMatchObject({
      status: 413,
      code: "BODY_TOO_LARGE",
    });
  });
  it("returns structured validation errors and preserves document conflicts", async () => {
    const request = new Request("https://planroom.test/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"title":4}',
    });
    await expect(
      readJson(request, z.object({ title: z.string() })),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    const response = await api(async () => {
      throw new AppError(
        409,
        "DOCUMENT_CONFLICT",
        "Updated metadata",
        undefined,
        7,
      );
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "DOCUMENT_CONFLICT",
        message: "Updated metadata",
        currentVersion: 7,
      },
    });
  });
  it("rejects invalid identifiers and noncanonical revision numbers", () => {
    expect(() => uuid("not-a-uuid")).toThrow(AppError);
    for (const value of ["0", "-1", "1.2", "2x", "2147483648"])
      expect(() => revisionNumber(value)).toThrow(AppError);
    expect(revisionNumber("2")).toBe(2);
  });
  it("uses configured origin and rejects cross-origin writes", () => {
    const previous = process.env.APP_URL;
    process.env.APP_URL = "https://planroom.test";
    try {
      expect(() =>
        assertSameOrigin(
          new Request("https://planroom.test/api", {
            headers: { origin: "https://attacker.test" },
          }),
        ),
      ).toThrow(AppError);
      expect(() =>
        assertSameOrigin(
          new Request("https://planroom.test/api", {
            headers: { origin: "https://planroom.test" },
          }),
        ),
      ).not.toThrow();
      expect(() =>
        assertSameOrigin(new Request("https://planroom.test/api")),
      ).toThrow(AppError);
    } finally {
      if (previous === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previous;
    }
  });
});
