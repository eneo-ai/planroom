import { updateDocumentSharingSchema } from "@/contracts";
import { getDocumentSharing, updateDocumentSharing } from "@/server/documents";
import { api, json, readJson, requirePrincipal, uuid } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () =>
    json(
      await getDocumentSharing(
        await requirePrincipal(request),
        uuid((await context.params).id),
      ),
    ),
  );
}
export async function PUT(request: Request, context: Context) {
  return api(async () =>
    json(
      await updateDocumentSharing(
        await requirePrincipal(request, { write: true }),
        uuid((await context.params).id),
        await readJson(request, updateDocumentSharingSchema),
      ),
    ),
  );
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
