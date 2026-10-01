import { describe, expect, it } from "vitest";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { markdownHtml } from "../src/client/markdown-preview";
import { htmlPreview } from "../src/client/html-preview";

function elements(
  node: DefaultTreeAdapterMap["node"],
  name: string,
): DefaultTreeAdapterMap["element"][] {
  const found = "tagName" in node && node.tagName === name ? [node] : [];
  if ("childNodes" in node)
    for (const child of node.childNodes) found.push(...elements(child, name));
  return found;
}

describe("Markdown preview", () => {
  it("renders headings with native fragment targets, tables, task lists and escaped code", () => {
    const source =
      "# Nästa steg\n\n[Hoppa](#nästa-steg)\n\n# Nästa steg\n\n| Ansvar | Uppgift |\n| --- | --- |\n| Team | Planera |\n\n- [x] Klart\n- [ ] Kvar\n\n```html\n<script>code()</script>\n```\n";
    const markup = htmlPreview(markdownHtml(source));
    const tree = parse(markup);
    expect(
      elements(tree, "h1").map(
        (heading) => heading.attrs.find((attr) => attr.name === "id")?.value,
      ),
    ).toEqual(["nästa-steg", "nästa-steg-1"]);
    expect(elements(tree, "table")).toHaveLength(1);
    expect(elements(tree, "input")).toHaveLength(2);
    expect(elements(tree, "code")).toHaveLength(1);
    expect(elements(tree, "script")).toHaveLength(0);
    expect(markup).toContain("&lt;script&gt;code()&lt;/script&gt;");
    const href = elements(tree, "a")[0].attrs.find(
      (attr) => attr.name === "href",
    )?.value;
    expect(decodeURIComponent(href ?? "")).toBe("#nästa-steg");
    expect(markup).toContain('<base href="about:srcdoc"');
  });
  it("escapes hostile embedded HTML and keeps scripts/resources blocked by the preview policy", () => {
    const source =
      '# Plan\n\n</main><script>alert(1)</script><iframe src="https://attacker.test"></iframe>\n\n<img src=x onerror="alert(1)">\n\n<style>body{display:none}</style>\n\n[Unsafe](javascript:alert(1))';
    const markup = htmlPreview(markdownHtml(source));
    const tree = parse(markup);
    expect(elements(tree, "script")).toHaveLength(0);
    expect(elements(tree, "iframe")).toHaveLength(0);
    expect(elements(tree, "img")).toHaveLength(0);
    expect(elements(tree, "style")).toHaveLength(1);
    expect(elements(tree, "main")).toHaveLength(1);
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).toContain("script-src 'none'");
    expect(markup).toContain("connect-src 'none'");
  });
});
