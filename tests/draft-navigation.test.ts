import { describe, expect, it } from "vitest";
import {
  shouldGuardDraftLink,
  type LinkNavigation,
} from "../src/client/draft-navigation";

const navigation: LinkNavigation = {
  href: "/settings",
  currentUrl: "https://planroom.example/documents/one",
  download: false,
  modified: false,
  prevented: false,
};

describe("document draft navigation", () => {
  it("guards a different internal page and query while a draft needs protection", () => {
    expect(shouldGuardDraftLink(navigation)).toBe(true);
    expect(shouldGuardDraftLink({ ...navigation, href: "?revision=2" })).toBe(
      true,
    );
  });
  it("leaves section links and the current page usable without a leave prompt", () => {
    expect(shouldGuardDraftLink({ ...navigation, href: "#architecture" })).toBe(
      false,
    );
    expect(
      shouldGuardDraftLink({ ...navigation, href: "/documents/one" }),
    ).toBe(false);
  });
  it("does not intercept downloads, new tabs, modified clicks, or handled links", () => {
    expect(shouldGuardDraftLink({ ...navigation, download: true })).toBe(false);
    expect(shouldGuardDraftLink({ ...navigation, target: "_blank" })).toBe(
      false,
    );
    expect(shouldGuardDraftLink({ ...navigation, modified: true })).toBe(false);
    expect(shouldGuardDraftLink({ ...navigation, prevented: true })).toBe(
      false,
    );
    expect(
      shouldGuardDraftLink({ ...navigation, href: "https://another.example/" }),
    ).toBe(false);
  });
});
