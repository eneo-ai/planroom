import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { PlanningFileViewer } from "../src/components/planning-file-viewer";

function elements(
  node: DefaultTreeAdapterMap["node"],
  name: string,
): DefaultTreeAdapterMap["element"][] {
  const found = "tagName" in node && node.tagName === name ? [node] : [];
  if ("childNodes" in node)
    for (const child of node.childNodes) found.push(...elements(child, name));
  return found;
}

describe("planning file display isolation", () => {
  it("keeps Markdown outside the app DOM and omits script activation", () => {
    const files = [
      {
        id: crypto.randomUUID(),
        name: "plan.md",
        format: "markdown" as const,
        content: "# Plan\n\n<script>attack()</script>",
      },
    ];
    const markup = renderToStaticMarkup(
      createElement(PlanningFileViewer, { files, title: "Plan" }),
    );
    const tree = parse(markup);
    const frames = elements(tree, "iframe");
    expect(frames).toHaveLength(1);
    expect(frames[0].attrs.find((attr) => attr.name === "sandbox")?.value).toBe(
      "",
    );
    expect(
      frames[0].attrs.find((attr) => attr.name === "srcdoc")?.value,
    ).toContain("script-src 'none'");
    expect(elements(tree, "script")).toHaveLength(0);
    expect(elements(tree, "main")).toHaveLength(0);
    expect(markup).not.toContain("Aktivera interaktivitet");
  });
  it("retains HTML script consent and downloads the selected original file", () => {
    const files = [
      {
        id: crypto.randomUUID(),
        name: "plan.html",
        format: "html" as const,
        content: "<h1>Original</h1>",
      },
    ];
    const markup = renderToStaticMarkup(
      createElement(PlanningFileViewer, {
        files,
        title: "Plan",
        documentId: "123e4567-e89b-42d3-a456-426614174000",
      }),
    );
    expect(markup).toContain("Aktivera interaktivitet");
    const frames = elements(parse(markup), "iframe");
    expect(frames).toHaveLength(1);
    expect(
      frames[0].attrs.find((attr) => attr.name === "srcdoc")?.value,
    ).toContain(files[0].content);
    expect(markup).toContain(`/export?fileId=${files[0].id}`);
  });
});
