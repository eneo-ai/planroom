import { setTeamMemberSchema } from "@/contracts";
import { listMembers, setMember } from "@/server/teams";
import { api, json, readJson, requirePrincipal, uuid } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () =>
    json({
      members: await listMembers(
        await requirePrincipal(request),
        uuid((await context.params).id),
      ),
    }),
  );
}
export async function PUT(request: Request, context: Context) {
  return api(async () => {
    await setMember(
      await requirePrincipal(request, { write: true }),
      uuid((await context.params).id),
      await readJson(request, setTeamMemberSchema),
    );
    return json({ ok: true });
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
