import type { PlanningFileSummary } from "./contracts";

/** Readable ASCII fallback plus the original UTF-8 filename; raw names never
 * become header syntax. Downloads retain the original file extension. */
export function planningFileExportDisposition(
  file: Pick<PlanningFileSummary, "name" | "format">,
  revision: number,
): string {
  const stem =
    file.name
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "") || "planroom";
  const extension = file.format === "html" ? "html" : "md";
  const original = encodeURIComponent(file.name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${stem}-v${revision}.${extension}"; filename*=UTF-8''${original}`;
}
