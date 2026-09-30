import { listRevisions } from "@/server/documents";
import { api, json, requirePrincipal, uuid } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () =>
    json({
      revisions: await listRevisions(
        await requirePrincipal(request),
        uuid((await context.params).id),
      ),
    }),
  );
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
