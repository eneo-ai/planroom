import { getRevision } from "@/server/documents";
import {
  api,
  json,
  requirePrincipal,
  uuid,
  revisionNumber,
} from "@/server/http";
type Context = { params: Promise<{ id: string; number: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () => {
    const principal = await requirePrincipal(request);
    const params = await context.params;
    return json(
      await getRevision(
        principal,
        uuid(params.id),
        revisionNumber(params.number),
      ),
    );
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
