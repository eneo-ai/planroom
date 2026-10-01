import { describe, expect, it } from "vitest";
import {
  commentSchema,
  createTokenSchema,
  createUserSchema,
  documentContentSchema,
  restoreSchema,
  setupSchema,
  updateDocumentSchema,
  statusSchema,
  canEditDocumentContent,
  updateDocumentStatusSchema,
  updateDocumentGitHubLinksSchema,
  apiTokenSchema,
} from "../src/contracts";

const content = {
  title: "Orkestreraren",
  html: '<!doctype html><html><body><svg><text>Plan</text></svg><script>document.title = "Demo";</script></body></html>',
  changeSummary: "Imported original planning document",
};

describe("planning input contract", () => {
  it("preserves the original HTML and instructions while defaulting document metadata", () => {
    const instructions =
      "  Läs besluten före uppdatering.\nBevara diagrammen.  ";
    const result = documentContentSchema.parse({ ...content, instructions });
    expect(result.html).toBe(content.html);
    expect(result.instructions).toBe(instructions);
    expect(result.status).toBe("draft");
    expect(result.description).toBe("");
  });

  it.each([
    ["title", " ", false],
    ["title", "a".repeat(200), true],
    ["title", "a".repeat(201), false],
    ["html", "", false],
    ["html", "a".repeat(2_000_000), true],
    ["html", "a".repeat(2_000_001), false],
    ["instructions", "a".repeat(100_001), false],
    ["description", "a".repeat(2_001), false],
    ["changeSummary", "  ", false],
    ["changeSummary", "a".repeat(1_001), false],
    ["status", "published", false],
  ] as const)("enforces the documented %s boundary", (field, value, valid) => {
    expect(
      documentContentSchema.safeParse({ ...content, [field]: value }).success,
    ).toBe(valid);
  });

  it.each([undefined, 0, -1, 1.5, "1"])(
    "requires an explicit positive integer document version for updates and restores (%s)",
    (expectedVersion) => {
      expect(
        updateDocumentSchema.safeParse({ ...content, expectedVersion }).success,
      ).toBe(false);
      expect(
        restoreSchema.safeParse({ expectedVersion, changeSummary: "Restore" })
          .success,
      ).toBe(false);
    },
  );

  it("accepts the document version as a numeric precondition", () => {
    expect(
      updateDocumentSchema.parse({ ...content, expectedVersion: 3 })
        .expectedVersion,
    ).toBe(3);
    expect(
      restoreSchema.parse({
        expectedVersion: 3,
        changeSummary: "Restore revision 1",
      }).expectedVersion,
    ).toBe(3);
  });

  it("freezes the handoff and later states and permits reopening into active planning", () => {
    expect(statusSchema.options.filter(canEditDocumentContent)).toEqual([
      "draft",
      "active",
    ]);
    for (const status of [
      "ready",
      "in_development",
      "completed",
      "archived",
    ] as const)
      expect(canEditDocumentContent(status)).toBe(false);
    expect(
      updateDocumentStatusSchema.parse({
        status: "active",
        expectedVersion: 4,
      }),
    ).toEqual({ status: "active", expectedVersion: 4 });
  });

  it("requires independent version preconditions for metadata and rejects content smuggled into a status write", () => {
    expect(
      updateDocumentStatusSchema.safeParse({ status: "ready" }).success,
    ).toBe(false);
    expect(
      updateDocumentGitHubLinksSchema.safeParse({ githubLinks: [] }).success,
    ).toBe(false);
    expect(
      updateDocumentStatusSchema.safeParse({
        status: "draft",
        expectedVersion: 1,
        html: "<p>Replacement</p>",
      }).success,
    ).toBe(false);
    expect(
      updateDocumentGitHubLinksSchema.safeParse({
        githubLinks: [],
        expectedLinksVersion: 1,
        status: "draft",
      }).success,
    ).toBe(false);
  });

  it("requires independent link versions and rejects the document/revision precondition", () => {
    expect(
      updateDocumentGitHubLinksSchema.parse({
        githubLinks: [],
        expectedLinksVersion: 1,
      }),
    ).toEqual({ githubLinks: [], expectedLinksVersion: 1 });
    for (const expectedLinksVersion of [undefined, 0, -1, 1.5, "1"])
      expect(
        updateDocumentGitHubLinksSchema.safeParse({
          githubLinks: [],
          expectedLinksVersion,
        }).success,
      ).toBe(false);
    expect(
      updateDocumentGitHubLinksSchema.safeParse({
        githubLinks: [],
        expectedVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      updateDocumentSchema.safeParse({ ...content, expectedRevision: 1 })
        .success,
    ).toBe(false);
  });

  it("requires a meaningful comment and limits section anchors", () => {
    expect(commentSchema.safeParse({ body: " \n " }).success).toBe(false);
    expect(
      commentSchema.safeParse({
        body: "Looks good",
        sectionId: "a".repeat(201),
      }).success,
    ).toBe(false);
    expect(
      commentSchema.parse({
        body: "  Discuss this decision  ",
        sectionId: "architecture",
      }),
    ).toEqual({ body: "Discuss this decision", sectionId: "architecture" });
  });
});

describe("identity and AI access input contract", () => {
  const replacement = {
    name: "Max Eriksson",
    email: "MAX@example.com",
    currentPassword: "initial-secret",
    password: "new-long-secret",
  };

  it("normalizes replacement identity and requires a new strong password", () => {
    expect(setupSchema.parse(replacement).email).toBe("max@example.com");
    expect(
      setupSchema.safeParse({ ...replacement, password: "too-short" }).success,
    ).toBe(false);
    expect(
      setupSchema.safeParse({ ...replacement, currentPassword: "" }).success,
    ).toBe(false);
    expect(
      setupSchema.safeParse({ ...replacement, email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("permits only the supported user roles", () => {
    expect(
      createUserSchema.safeParse({ ...replacement, role: "admin" }).success,
    ).toBe(true);
    expect(
      createUserSchema.safeParse({ ...replacement, role: "superadmin" })
        .success,
    ).toBe(false);
  });

  it("requires an explicit token scope rather than granting write access by default", () => {
    expect(createTokenSchema.safeParse({ name: "AI" }).success).toBe(false);
    expect(
      createTokenSchema.safeParse({ name: "AI", scope: "admin" }).success,
    ).toBe(false);
    expect(
      createTokenSchema.parse({
        name: "  Research assistant  ",
        scope: "read",
      }),
    ).toEqual({ name: "Research assistant", scope: "read" });
  });

  it("returns only a masked key identifier in metadata and permits unavailable historical suffixes", () => {
    const metadata = {
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "AI client",
      scope: "read",
      createdAt: "2026-09-30T10:00:00.000Z",
      expiresAt: "2026-12-29T10:00:00.000Z",
      lastUsedAt: null,
      maskedToken: "********aB_9",
    };
    expect(
      apiTokenSchema.parse({
        ...metadata,
        token: "full-secret",
        secret_hash: "hash",
      }),
    ).toEqual(metadata);
    expect(
      apiTokenSchema.parse({ ...metadata, maskedToken: null }).maskedToken,
    ).toBeNull();
    expect(
      apiTokenSchema.safeParse({
        ...metadata,
        maskedToken: "pr_complete-secret",
      }).success,
    ).toBe(false);
  });
});
