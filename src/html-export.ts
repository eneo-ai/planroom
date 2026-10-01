/** Safe, readable attachment name; never derive response headers from raw titles. */
export function htmlExportFilename(title: string, revision: number): string {
  const name =
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "") || "planroom";
  return `${name}-v${revision}.html`;
}
