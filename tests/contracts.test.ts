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
  planningFilesSchema,
} from "../src/contracts";

const content = {
  title: "Orkestreraren",
  files: [
    {
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "plan.html",
      format: "html",
      content:
        '<!doctype html><html><body><svg><text>Plan</text></svg><script>document.title = "Demo";</script></body></html>',
    },
  ],
  changeSummary: "Imported original planning document",
};

describe("planning input contract", () => {
  it("preserves the original HTML and instructions while defaulting document metadata", () => {
    const instructions =
      "  Läs besluten före uppdatering.\nBevara diagrammen.  ";
    const result = documentContentSchema.parse({ ...content, instructions });
    expect(result.files).toEqual(content.files);
    expect(result.instructions).toBe(instructions);
    expect(result.status).toBe("draft");
    expect(result.description).toBe("");
  });

  it.each([
    ["title", " ", false],
    ["title", "a".repeat(200), true],
    ["title", "a".repeat(201), false],
    ["files", [], false],
    ["files", [{ ...content.files[0], content: "" }], false],
    ["files", [{ ...content.files[0], content: "a".repeat(2_000_000) }], true],
    ["files", [{ ...content.files[0], content: "a".repeat(2_000_001) }], false],
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

  it("accepts multiple HTML files, Markdown-only plans and mixed formats without changing sources", () => {
    const html = content.files[0];
    const markdown = {
      id: "223e4567-e89b-42d3-a456-426614174000",
      name: "beslut.md",
      format: "markdown",
      content: "  # Beslut\r\n\r\n- [ ] Bevara originalet  \r\n",
    };
    const secondHtml = {
      ...html,
      id: "323e4567-e89b-42d3-a456-426614174000",
      name: "demo.HTM",
    };
    const secondMarkdown = {
      ...markdown,
      id: "423e4567-e89b-42d3-a456-426614174000",
      name: "spec.markdown",
    };
    for (const files of [
      [html, secondHtml],
      [markdown],
      [markdown, secondMarkdown],
      [html, markdown],
    ]) {
      expect(documentContentSchema.parse({ ...content, files }).files).toEqual(
        files,
      );
      expect(
        updateDocumentSchema.parse({ ...content, files, expectedVersion: 1 })
          .files,
      ).toEqual(files);
    }
  });

  it("rejects duplicate identities/names, wrong formats, paths and aggregate source overflow", () => {
    const file = content.files[0];
    for (const files of [
      [file, { ...file, name: "other.html" }],
      [file, { ...file, id: file.id.toUpperCase(), name: "other.html" }],
      [
        file,
        {
          ...file,
          id: "223e4567-e89b-42d3-a456-426614174000",
          name: "PLAN.HTML",
        },
      ],
      [{ ...file, name: "plan.md" }],
      [{ ...file, format: "pdf" }],
      [{ ...file, id: "bad-id" }],
      [{ ...file, name: "../plan.html" }],
      [{ ...file, name: "plan\r\n.html" }],
      [{ ...file, name: "invalid\ud800.html" }],
      [{ ...file, content: "source\0" }],
      [{ ...file, content: "source\ud800" }],
      [
        { ...file, content: "a".repeat(1_000_001) },
        {
          ...file,
          id: "223e4567-e89b-42d3-a456-426614174000",
          name: "other.html",
          content: "a".repeat(1_000_000),
        },
      ],
    ])
      expect(planningFilesSchema.safeParse(files).success).toBe(false);
    const files = Array.from({ length: 21 }, (_, index) => ({
      ...file,
      id: crypto.randomUUID(),
      name: `plan-${index}.html`,
    }));
    expect(planningFilesSchema.safeParse(files.slice(0, 20)).success).toBe(
      true,
    );
    expect(planningFilesSchema.safeParse(files).success).toBe(false);
    expect(
      documentContentSchema.safeParse({
        title: "Old request",
        html: "<p>Legacy</p>",
        changeSummary: "Import",
      }).success,
    ).toBe(false);
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
        files: content.files,
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
