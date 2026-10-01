import { describe, expect, it } from "vitest";
import { readPlanningFiles } from "../src/client/planning-files";
import { planningFileFormat } from "../src/contracts";

describe("planning file import", () => {
  it("appends a complete mixed selection while preserving filenames, sources and existing files", async () => {
    const existing = [
      {
        id: crypto.randomUUID(),
        name: "befintlig.md",
        format: "markdown" as const,
        content: "# Bevara",
      },
    ];
    const html = "<!doctype html>\r\n<svg>Original</svg>  ";
    const markdown = "  # Plan\r\n\r\n- [ ] Nästa steg\r\n";
    const additions = await readPlanningFiles(
      [new File([html], "demo.HTML"), new File([markdown], "beslut.md")],
      existing,
    );
    expect(
      additions.map(({ name, format, content }) => ({ name, format, content })),
    ).toEqual([
      { name: "demo.HTML", format: "html", content: html },
      { name: "beslut.md", format: "markdown", content: markdown },
    ]);
    expect(
      new Set([...existing, ...additions].map((file) => file.id)).size,
    ).toBe(3);
    expect(existing[0].content).toBe("# Bevara");
    expect(planningFileFormat("spec.markdown")).toBe("markdown");
  });
  it("rejects duplicates, unsupported/empty files and over-budget selections before returning partial imports", async () => {
    const file = new File(["# Plan"], "plan.md");
    await expect(
      readPlanningFiles([file, new File(["other"], "PLAN.MD")], []),
    ).rejects.toThrow("finns redan");
    await expect(
      readPlanningFiles([file, new File(["data"], "plan.pdf")], []),
    ).rejects.toThrow("HTML- eller Markdown");
    await expect(
      readPlanningFiles([file, new File([" \n"], "empty.html")], []),
    ).rejects.toThrow("är tom");
    await expect(
      readPlanningFiles([new File(["bad\0source"], "bad.md")], []),
    ).rejects.toThrow("Unicode");
    await expect(
      readPlanningFiles([new File(["a".repeat(2_000_001)], "large.md")], []),
    ).rejects.toThrow("2 MB");
    const existing = [
      {
        id: crypto.randomUUID(),
        name: "large.md",
        format: "markdown" as const,
        content: "a".repeat(2_000_000),
      },
    ];
    await expect(readPlanningFiles([file], existing)).rejects.toThrow(
      "tillsammans",
    );
    await expect(
      readPlanningFiles(
        Array.from(
          { length: 21 },
          (_, index) => new File(["# Plan"], `${index}.md`),
        ),
        [],
      ),
    ).rejects.toThrow("20 filer");
  });
  it("leaves existing sources intact when a later file cannot be read", async () => {
    class UnreadableFile extends File {
      async text(): Promise<string> {
        throw new Error("Read failed");
      }
    }
    const existing = [
      {
        id: crypto.randomUUID(),
        name: "keep.md",
        format: "markdown" as const,
        content: "Original",
      },
    ];
    await expect(
      readPlanningFiles(
        [
          new File(["# New"], "new.md"),
          new UnreadableFile(["x"], "broken.html"),
        ],
        existing,
      ),
    ).rejects.toThrow("Read failed");
    expect(existing.map((file) => file.content)).toEqual(["Original"]);
  });
});
