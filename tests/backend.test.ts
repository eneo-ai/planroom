import { describe, expect, it } from "vitest";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../src/server/passwords";
import { api, readJson, revisionNumber, uuid } from "../src/server/http";
import { AppError } from "../src/server/errors";
import { assertSameOrigin } from "../src/server/auth";

describe("password protection", () => {
  it("salts equal passwords independently and accepts only the matching password", async () => {
    const password = "An actual long passphrase";
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword("wrong password", first)).toBe(false);
    expect(await verifyPassword(password, "scrypt$broken$00")).toBe(false);
  });
});
describe("HTTP input boundaries", () => {
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
  it("returns structured validation errors and preserves revision conflicts", async () => {
    const request = new Request("https://planroom.test/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"title":4}',
    });
    await expect(
      readJson(request, z.object({ title: z.string() })),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    const response = await api(async () => {
      throw new AppError(409, "REVISION_CONFLICT", "New revision", 7);
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "REVISION_CONFLICT",
        message: "New revision",
        currentRevision: 7,
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
