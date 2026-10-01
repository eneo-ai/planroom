import {
  maxPlanningFiles,
  maxPlanningSourceLength,
  planningFileFormat,
  planningFileSchema,
  planningFileSummarySchema,
  type PlanningFile,
} from "../contracts";

/** Read an entire selection before adding it, so failures leave the draft intact. */
export async function readPlanningFiles(
  selected: readonly File[],
  existing: readonly PlanningFile[],
): Promise<PlanningFile[]> {
  if (existing.length + selected.length > maxPlanningFiles)
    throw new Error(`En planering får ha högst ${maxPlanningFiles} filer.`);
  if (
    selected.reduce((bytes, file) => bytes + file.size, 0) >
    maxPlanningSourceLength
  )
    throw new Error("Importera högst 2 MB åt gången.");
  const names = new Set(existing.map((file) => file.name.toLowerCase()));
  const pending = selected.map((file) => {
    const format = planningFileFormat(file.name);
    const metadata = planningFileSummarySchema.safeParse({
      id: crypto.randomUUID(),
      name: file.name,
      format,
    });
    if (!metadata.success)
      throw new Error("Välj HTML- eller Markdown-filer med giltiga filnamn.");
    if (names.has(file.name.toLowerCase()))
      throw new Error(
        `Filen ${file.name} finns redan. Byt filnamn eller redigera den befintliga filen.`,
      );
    names.add(file.name.toLowerCase());
    return { file, metadata: metadata.data };
  });
  const additions: PlanningFile[] = [];
  let length = existing.reduce((sum, file) => sum + file.content.length, 0);
  for (const { file, metadata } of pending) {
    const content = await file.text();
    if (!content.trim()) throw new Error(`Filen ${file.name} är tom.`);
    length += content.length;
    if (length > maxPlanningSourceLength)
      throw new Error(
        "Filernas källor får tillsammans vara högst 2 000 000 tecken.",
      );
    const parsed = planningFileSchema.safeParse({ ...metadata, content });
    if (!parsed.success)
      throw new Error(
        `${file.name}: ${parsed.error.issues.map((issue) => issue.message).join(" · ")}`,
      );
    additions.push(parsed.data);
  }
  return additions;
}
