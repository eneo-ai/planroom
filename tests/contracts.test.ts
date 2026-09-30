import { describe, expect, it } from "vitest";
import {
  commentSchema,
  createTokenSchema,
  createUserSchema,
  documentContentSchema,
  restoreSchema,
  setupSchema,
  updateDocumentSchema,
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
    "requires an explicit positive integer revision for updates and restores (%s)",
    (expectedRevision) => {
      expect(
        updateDocumentSchema.safeParse({ ...content, expectedRevision })
          .success,
      ).toBe(false);
      expect(
        restoreSchema.safeParse({ expectedRevision, changeSummary: "Restore" })
          .success,
      ).toBe(false);
    },
  );

  it("accepts the current revision as a numeric precondition", () => {
    expect(
      updateDocumentSchema.parse({ ...content, expectedRevision: 3 })
        .expectedRevision,
    ).toBe(3);
    expect(
      restoreSchema.parse({
        expectedRevision: 3,
        changeSummary: "Restore revision 1",
      }).expectedRevision,
    ).toBe(3);
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
});
