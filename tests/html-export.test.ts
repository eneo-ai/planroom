import { describe, expect, it } from "vitest";
import { htmlExportFilename } from "../src/html-export";

describe("HTML download filenames", () => {
  it("uses a readable title and saved HTML revision", () => {
    expect(htmlExportFilename("Åtgärder för Sundsvall", 3)).toBe(
      "atgarder-for-sundsvall-v3.html",
    );
  });
  it("bounds the name and prevents path/header injection from untrusted titles", () => {
    expect(htmlExportFilename('"\r\n../Plan/\\Escape"', 2)).toBe(
      "plan-escape-v2.html",
    );
    expect(htmlExportFilename("<💻>", 1)).toBe("planroom-v1.html");
    expect(htmlExportFilename("a".repeat(200), 12)).toBe(
      `${"a".repeat(80)}-v12.html`,
    );
  });
});
