import { planningFileExportDisposition } from "@/planning-file-export";
import { getDocument } from "@/server/documents";
import { api, requirePrincipal, uuid } from "@/server/http";
import { AppError, notFound } from "@/server/errors";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () => {
    const document = await getDocument(
      await requirePrincipal(request),
      uuid((await context.params).id),
    );
    const fileId = new URL(request.url).searchParams.get("fileId");
    if (fileId === null && document.files.length !== 1)
      throw new AppError(
        400,
        "FILE_REQUIRED",
        "Välj filen som ska exporteras med fileId.",
      );
    const selectedId = fileId === null ? null : uuid(fileId).toLowerCase();
    const file =
      selectedId === null
        ? document.files[0]
        : document.files.find((entry) => entry.id.toLowerCase() === selectedId);
    if (!file) notFound();
    return new Response(file.content, {
      headers: {
        "Content-Type":
          file.format === "html"
            ? "text/html; charset=utf-8"
            : "text/markdown; charset=utf-8",
        "Content-Disposition": planningFileExportDisposition(
          file,
          document.currentRevision,
        ),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
