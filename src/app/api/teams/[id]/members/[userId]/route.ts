import { removeMember } from "@/server/teams";
import { api, json, requirePrincipal, uuid } from "@/server/http";
type Context = { params: Promise<{ id: string; userId: string }> };
export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    const params = await context.params;
    await removeMember(
      await requirePrincipal(request, { write: true }),
      uuid(params.id),
      uuid(params.userId),
    );
    return json({ ok: true });
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
