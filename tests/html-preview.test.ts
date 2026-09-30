import { describe, expect, it } from "vitest";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { readFileSync } from "node:fs";
import { htmlPreview } from "../src/client/html-preview";
import config from "../next.config";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
function elements(node: Node, name: string): Element[] {
  const found: Element[] =
    "tagName" in node && node.tagName === name ? [node] : [];
  if ("childNodes" in node)
    for (const child of node.childNodes) found.push(...elements(child, name));
  return found;
}
function policy(source: string) {
  const document = parse(source);
  const head = elements(document, "head")[0];
  const csp = elements(head, "meta").find((meta) =>
    meta.attrs.some(
      (attr) =>
        attr.name === "http-equiv" &&
        attr.value.toLowerCase() === "content-security-policy",
    ),
  );
  return csp?.attrs.find((attr) => attr.name === "content")?.value;
}

describe("HTML preview isolation", () => {
  it.each([
    "<!doctype html><html><head><script>alert(1)</script></head><body>Plan</body></html>",
    "<!-- <head> --><script>alert(1)</script><svg><text>Diagram</text></svg>",
    '</head><body><meta http-equiv="Content-Security-Policy" content="default-src *"><script>alert(1)</script>',
    '<html><head><base href="https://attacker.example/"></head><body>Plan</body></html>',
  ])(
    "places the enforced CSP in the real parsed head before untrusted markup",
    (source) => {
      const preview = htmlPreview(source);
      const restrictions = policy(preview);
      expect(restrictions).toContain("script-src 'none'");
      expect(restrictions).toContain("connect-src 'none'");
      expect(restrictions).toContain("base-uri about:");
      expect(preview.indexOf("Content-Security-Policy")).toBeLessThan(
        preview.indexOf(source),
      );
    },
  );
  it("resolves native fragments against srcdoc before any supplied base", () => {
    const source =
      '<base href="https://attacker.example/" target="_top"><a href="#arkitektur">Arkitektur</a><section id="arkitektur">Plan</section>';
    const preview = htmlPreview(source);
    const document = parse(preview);
    const base = elements(document, "base")[0];
    const href = base.attrs.find((attr) => attr.name === "href")?.value;
    expect(href).toBe("about:srcdoc");
    expect(base.attrs.find((attr) => attr.name === "target")?.value).toBe(
      "_self",
    );
    const anchor = elements(document, "a")[0];
    const fragment = anchor.attrs.find((attr) => attr.name === "href")?.value;
    expect(new URL(fragment ?? "", href).href).toBe("about:srcdoc#arkitektur");
    expect(preview.indexOf("Content-Security-Policy")).toBeLessThan(
      preview.indexOf('<base href="about:srcdoc"'),
    );
    expect(preview.indexOf('<base href="about:srcdoc"')).toBeLessThan(
      preview.indexOf(source),
    );
    expect(preview).toContain(source);
  });
  it("permits the fixed srcdoc base through the inherited parent policy", async () => {
    const headers = await config.headers?.();
    const parentPolicy = headers
      ?.flatMap((route) => route.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;
    expect(parentPolicy).toContain("base-uri 'self' about:");
    expect(parentPolicy).toContain("frame-src 'self' about:;");
    expect(parentPolicy).not.toContain("blob:");
  });
  it("allows inline demonstrations only when explicitly enabled, never external resources", () => {
    const restrictions = policy(htmlPreview("<script>demo()</script>", true));
    expect(restrictions).toContain("script-src 'unsafe-inline'");
    expect(restrictions).toContain("default-src 'none'");
    expect(restrictions).toContain("connect-src 'none'");
    expect(restrictions).toContain("form-action 'none'");
  });
  it("retains the real planning example and SVG diagrams without converting the source", () => {
    const source = readFileSync(
      new URL("../examples/orchestrator.html", import.meta.url),
      "utf8",
    );
    const preview = htmlPreview(source);
    expect(preview).toContain(source);
    expect(elements(parse(preview), "svg")).toHaveLength(
      elements(parse(source), "svg").length,
    );
    expect(elements(parse(preview), "svg").length).toBeGreaterThan(4);
  });
});
