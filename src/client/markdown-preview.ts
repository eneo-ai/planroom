import { Marked } from "marked";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** Derived iframe markup only. Raw Markdown is the persisted/exported source. */
export function markdownHtml(source: string): string {
  const anchors = new Set<string>();
  const parser = new Marked({
    async: false,
    gfm: true,
    renderer: {
      // Show embedded HTML as text; Markdown never offers script consent.
      html({ text }) {
        return escapeHtml(text);
      },
      heading({ text, tokens, depth }) {
        const base =
          text
            .toLowerCase()
            .trim()
            .replace(/[^\p{L}\p{N}\s_-]/gu, "")
            .replace(/\s+/g, "-") || "section";
        let id = base;
        let number = 1;
        while (anchors.has(id)) id = `${base}-${number++}`;
        anchors.add(id);
        return `<h${depth} id="${escapeHtml(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
    },
  });
  return `<style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, sans-serif; line-height: 1.65; max-width: 72ch; margin: 0 auto; padding: 2rem; overflow-wrap: anywhere; }
    h1, h2, h3, h4 { line-height: 1.3; scroll-margin-top: 1rem; }
    pre { overflow-x: auto; padding: 1rem; border: 1px solid; border-radius: .5rem; }
    code { font-family: ui-monospace, monospace; }
    table { border-collapse: collapse; display: block; overflow-x: auto; }
    th, td { border: 1px solid; padding: .5rem .75rem; }
    blockquote { margin-left: 0; border-left: .25rem solid; padding-left: 1rem; }
    img { max-width: 100%; }
  </style><main>${parser.parse(source, { async: false })}</main>`;
}
