import { assertSameOrigin, deleteToken } from "@/server/auth";
import { api, json, requirePrincipal, uuid } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    assertSameOrigin(request);
    await deleteToken(
      await requirePrincipal(request),
      uuid((await context.params).id),
    );
    return json({ ok: true });
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
