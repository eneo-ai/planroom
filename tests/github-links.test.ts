import { describe, expect, it } from "vitest";
import { githubLink, githubLinksInputSchema } from "../src/github-links";

describe("GitHub planning references", () => {
  it("keeps issue and PR identity and removes query strings and comment anchors", () => {
    const links = githubLinksInputSchema.parse([
      " https://github.com/eneo-ai/planroom/issues/12?notification=private#issuecomment-3 ",
      "https://github.com/eneo-ai/planroom/pull/34/",
    ]);
    expect(links).toEqual([
      "https://github.com/eneo-ai/planroom/issues/12",
      "https://github.com/eneo-ai/planroom/pull/34",
    ]);
    expect(githubLink(links[0])).toEqual({
      url: links[0],
      repository: "eneo-ai/planroom",
      kind: "issue",
      number: "12",
    });
    expect(githubLink(links[1])).toMatchObject({
      kind: "pull_request",
      number: "34",
    });
  });

  it.each([
    "javascript:alert(1)",
    "http://github.com/owner/repo/issues/1",
    "https://github.com.evil.test/owner/repo/issues/1",
    "https://github.com@evil.test/owner/repo/issues/1",
    "https://secret@github.com/owner/repo/issues/1",
    "https://github.com/owner/repo",
    "https://github.com/owner/repo/commit/1",
    "https://github.com/owner/repo/issues/0",
    "https://github.com/owner/repo/issues/01",
    "https://github.com/owner/repo/issues/1/files",
    "https://github.com/owner/repo/pull/1/files",
    "https://github.com/owner/repo/issues/999999999999999999999",
  ])("rejects non-reference or unsafe URLs: %s", (url) => {
    expect(githubLinksInputSchema.safeParse([url]).success).toBe(false);
  });

  it("rejects duplicate references after normalization and bounds the list", () => {
    expect(
      githubLinksInputSchema.safeParse([
        "https://github.com/Owner/Repo/issues/1",
        "https://github.com/owner/repo/issues/1#issuecomment-2",
      ]).success,
    ).toBe(false);
    const links = Array.from(
      { length: 20 },
      (_, i) => `https://github.com/o/r/issues/${i + 1}`,
    );
    expect(githubLinksInputSchema.parse(links)).toEqual(links);
    expect(
      githubLinksInputSchema.safeParse([
        ...links,
        "https://github.com/o/r/pull/21",
      ]).success,
    ).toBe(false);
    expect(githubLinksInputSchema.parse([])).toEqual([]);
  });
});
