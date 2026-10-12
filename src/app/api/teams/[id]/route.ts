import { updateNamedEntitySchema } from "@/contracts";
import { getTeam, updateTeam } from "@/server/teams";
import { api, json, readJson, requirePrincipal, uuid } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () =>
    json(
      await getTeam(
        await requirePrincipal(request),
        uuid((await context.params).id),
      ),
    ),
  );
}
export async function PUT(request: Request, context: Context) {
  return api(async () =>
    json(
      await updateTeam(
        await requirePrincipal(request, { write: true }),
        uuid((await context.params).id),
        await readJson(request, updateNamedEntitySchema),
      ),
    ),
  );
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
