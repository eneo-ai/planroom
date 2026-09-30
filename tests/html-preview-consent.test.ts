import { describe, expect, it } from "vitest";
import {
  htmlPreviewConsent,
  type HtmlPreviewConsent,
} from "../src/client/html-preview";

const original = "<script>trustedDemo()</script>";
const replacement = "<script>replacementDemo()</script>";

describe("HTML preview script consent", () => {
  const protectedPreview: HtmlPreviewConsent = {
    source: original,
    mode: "protected",
  };

  it("requires confirmation for the displayed source before enabling scripts", () => {
    expect(
      htmlPreviewConsent(protectedPreview, {
        type: "approve",
        source: original,
      }).mode,
    ).toBe("protected");
    const requested = htmlPreviewConsent(protectedPreview, {
      type: "request",
      source: original,
    });
    expect(requested.mode).toBe("confirming");
    expect(
      htmlPreviewConsent(requested, { type: "approve", source: original }).mode,
    ).toBe("interactive");
  });

  it("invalidates a pending decision when an asynchronous import replaces the source", () => {
    const requested = htmlPreviewConsent(protectedPreview, {
      type: "request",
      source: original,
    });
    const changed = htmlPreviewConsent(requested, {
      type: "source-changed",
      source: replacement,
    });
    expect(changed).toEqual({ source: replacement, mode: "protected" });
    expect(
      htmlPreviewConsent(changed, { type: "approve", source: original }),
    ).toEqual(changed);
    expect(
      htmlPreviewConsent(changed, { type: "approve", source: replacement }),
    ).toEqual(changed);
  });

  it("does not remember approval when a document changes and then returns to its old source", () => {
    const approved: HtmlPreviewConsent = {
      source: original,
      mode: "interactive",
    };
    const changed = htmlPreviewConsent(approved, {
      type: "source-changed",
      source: replacement,
    });
    const returned = htmlPreviewConsent(changed, {
      type: "source-changed",
      source: original,
    });
    expect(returned).toEqual(protectedPreview);
  });

  it("allows cancelling confirmation and disabling an approved demonstration", () => {
    expect(
      htmlPreviewConsent(
        { source: original, mode: "confirming" },
        { type: "dismiss", source: original },
      ),
    ).toEqual(protectedPreview);
    expect(
      htmlPreviewConsent(
        { source: original, mode: "interactive" },
        { type: "disable", source: original },
      ),
    ).toEqual(protectedPreview);
  });
});
