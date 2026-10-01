import { htmlExportFilename } from "@/html-export";
import { getDocument } from "@/server/documents";
import { api, requirePrincipal, uuid } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () => {
    const document = await getDocument(
      await requirePrincipal(request),
      uuid((await context.params).id),
    );
    return new Response(document.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${htmlExportFilename(document.title, document.currentRevision)}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
