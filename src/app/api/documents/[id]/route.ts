import { updateDocumentSchema } from "@/contracts";
import { getDocument, updateDocument } from "@/server/documents";
import { api, json, readJson, requirePrincipal, uuid } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () =>
    json(
      await getDocument(
        await requirePrincipal(request),
        uuid((await context.params).id),
      ),
    ),
  );
}
export async function PUT(request: Request, context: Context) {
  return api(async () => {
    const principal = await requirePrincipal(request, { write: true });
    return json(
      await updateDocument(
        principal,
        uuid((await context.params).id),
        await readJson(request, updateDocumentSchema),
      ),
    );
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
