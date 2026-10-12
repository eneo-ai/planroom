import { resetUserPassword } from "@/server/auth";
import { api, json, requirePrincipal, uuid } from "@/server/http";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return api(async () =>
    json(
      await resetUserPassword(
        await requirePrincipal(request, { write: true }),
        uuid((await context.params).id),
      ),
    ),
  );
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
