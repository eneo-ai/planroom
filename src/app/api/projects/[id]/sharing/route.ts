import { updateProjectSharingSchema } from "@/contracts";
import { getProjectSharing, updateProjectSharing } from "@/server/projects";
import { api, json, readJson, requirePrincipal, uuid } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () =>
    json(
      await getProjectSharing(
        await requirePrincipal(request),
        uuid((await context.params).id),
      ),
    ),
  );
}
export async function PUT(request: Request, context: Context) {
  return api(async () =>
    json(
      await updateProjectSharing(
        await requirePrincipal(request, { write: true }),
        uuid((await context.params).id),
        await readJson(request, updateProjectSharingSchema),
      ),
    ),
  );
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
