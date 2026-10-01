import { describe, expect, it } from "vitest";
import { planningFileExportDisposition } from "../src/planning-file-export";

describe("planning file download filenames", () => {
  it("uses a readable filename and saved revision with the original UTF-8 name", () => {
    expect(
      planningFileExportDisposition(
        { name: "Åtgärder för Sundsvall.html", format: "html" },
        3,
      ),
    ).toBe(
      "attachment; filename=\"atgarder-for-sundsvall-v3.html\"; filename*=UTF-8''%C3%85tg%C3%A4rder%20f%C3%B6r%20Sundsvall.html",
    );
    expect(
      planningFileExportDisposition(
        { name: "beslut.md", format: "markdown" },
        2,
      ),
    ).toBe("attachment; filename=\"beslut-v2.md\"; filename*=UTF-8''beslut.md");
  });
  it("bounds the fallback and keeps quotes/control characters out of header syntax", () => {
    const header = planningFileExportDisposition(
      { name: "a\r\n\"Injected: value'.html", format: "html" },
      1,
    );
    expect(header).toContain('filename="a-injected-value-v1.html"');
    expect(header).not.toContain("\r");
    expect(header).not.toContain("\n");
    expect(header).toContain("%0D%0A%22Injected%3A%20value%27.html");
    expect(
      planningFileExportDisposition({ name: ".html", format: "html" }, 1),
    ).toContain('filename="planroom-v1.html"');
    expect(
      planningFileExportDisposition(
        { name: "a".repeat(200) + ".md", format: "markdown" },
        12,
      ),
    ).toContain(`filename="${"a".repeat(80)}-v12.md"`);
  });
});
