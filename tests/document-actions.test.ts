import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { describe, expect, it } from "vitest";
import { DocumentHtmlExport } from "../src/components/document-export";
import {
  GitHubReferences,
  DocumentGitHubLinks,
} from "../src/components/document-github-links";

type Node = DefaultTreeAdapterMap["node"];
function anchors(node: Node): DefaultTreeAdapterMap["element"][] {
  const children = "childNodes" in node ? node.childNodes.flatMap(anchors) : [];
  return "tagName" in node && node.tagName === "a"
    ? [node, ...children]
    : children;
}
function attribute(node: DefaultTreeAdapterMap["element"], name: string) {
  return node.attrs.find((attr) => attr.name === name)?.value;
}
function textContent(node: Node): string {
  if (node.nodeName === "#text" && "value" in node) return node.value;
  return "childNodes" in node ? node.childNodes.map(textContent).join("") : "";
}
const links = [
  "https://github.com/eneo-ai/planroom/issues/7",
  "https://github.com/eneo-ai/planroom/pull/8",
  "https://github.com/another/repository/issues/9",
];

describe("planning action semantics", () => {
  it("exports via a native download link and clearly identifies saved HTML when a draft exists", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DocumentHtmlExport, {
        documentId: "test-document",
        hasDraft: true,
      }),
    );
    const [link] = anchors(parseFragment(markup));
    expect(attribute(link, "href")).toBe("/api/documents/test-document/export");
    expect(attribute(link, "download")).toBeDefined();
    expect(markup).toContain("Ladda ner HTML");
    expect(markup).toContain("Ditt osparade utkast ingår inte.");
    expect(
      renderToStaticMarkup(
        React.createElement(DocumentHtmlExport, {
          documentId: "test-document",
          hasDraft: false,
        }),
      ),
    ).not.toContain("Ditt osparade utkast");
  });
  it("bounds card summaries while keeping type, full repository and external destination accessible", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GitHubReferences, { links }),
    );
    const references = anchors(parseFragment(markup));
    expect(references).toHaveLength(2);
    expect(attribute(references[0], "aria-label")).toContain(
      "eneo-ai/planroom, Issue #7",
    );
    expect(attribute(references[1], "aria-label")).toContain("PR #8");
    expect(textContent(references[0])).toContain("planroom");
    expect(textContent(references[0])).toContain("Issue #7");
    expect(textContent(references[1])).toContain("PR #8");
    for (const [index, reference] of references.entries()) {
      expect(attribute(reference, "href")).toBe(links[index]);
      expect(attribute(reference, "target")).toBe("_blank");
      expect(attribute(reference, "rel")).toContain("noopener");
    }
    expect(markup).toContain("+1 till");
    expect(
      renderToStaticMarkup(
        React.createElement(GitHubReferences, { links: [] }),
      ),
    ).toBe("");
  });
  it("preserves full repository context and the visible PR number for long repository names", () => {
    const repository = "a-very-long-repository-".repeat(6);
    const [reference] = anchors(
      parseFragment(
        renderToStaticMarkup(
          React.createElement(GitHubReferences, {
            links: [`https://github.com/organisation/${repository}/pull/867`],
          }),
        ),
      ),
    );
    expect(attribute(reference, "aria-label")).toBe(
      `organisation/${repository}, PR #867 (öppnas i ny flik)`,
    );
    expect(textContent(reference)).toContain("PR #867");
    expect(attribute(reference, "target")).toBe("_blank");
  });
  it("shows the complete list with repository context and gives viewers no mutation controls", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DocumentGitHubLinks, {
        documentId: "test-document",
        metadata: { githubLinks: links, githubLinksVersion: 1 },
        canWrite: false,
        onUpdated: () => {},
        onSavingChange: () => {},
      }),
    );
    expect(anchors(parseFragment(markup))).toHaveLength(3);
    expect(markup).toContain("another/repository");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("Ta bort");
  });
});
