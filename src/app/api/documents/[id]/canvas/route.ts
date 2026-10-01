import { updateCanvasSchema } from "@/contracts";
import { getDocumentCanvas, updateDocumentCanvas } from "@/server/documents";
import { api, json, readJson, requirePrincipal, uuid } from "@/server/http";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () =>
    json(
      await getDocumentCanvas(
        await requirePrincipal(request),
        uuid((await context.params).id),
      ),
    ),
  );
}
export async function POST(request: Request, context: Context) {
  return api(async () => {
    const principal = await requirePrincipal(request, { write: true });
    const input = await readJson(request, updateCanvasSchema);
    return json(
      await updateDocumentCanvas(
        principal,
        uuid((await context.params).id),
        input,
      ),
    );
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
