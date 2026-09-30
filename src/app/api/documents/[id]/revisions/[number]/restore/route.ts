import { restoreSchema } from "@/contracts";
import { restoreDocument } from "@/server/documents";
import {
  api,
  json,
  readJson,
  requirePrincipal,
  uuid,
  revisionNumber,
} from "@/server/http";
type Context = { params: Promise<{ id: string; number: string }> };
export async function POST(request: Request, context: Context) {
  return api(async () => {
    const principal = await requirePrincipal(request, { write: true });
    const params = await context.params;
    return json(
      await restoreDocument(
        principal,
        uuid(params.id),
        revisionNumber(params.number),
        await readJson(request, restoreSchema),
      ),
    );
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
