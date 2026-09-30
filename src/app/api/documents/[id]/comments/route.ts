import { commentSchema } from "@/contracts";
import { addComment, listComments } from "@/server/documents";
import { api, json, readJson, requirePrincipal, uuid } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () =>
    json({
      comments: await listComments(
        await requirePrincipal(request),
        uuid((await context.params).id),
      ),
    }),
  );
}
export async function POST(request: Request, context: Context) {
  return api(async () => {
    const principal = await requirePrincipal(request, { write: true });
    return json(
      await addComment(
        principal,
        uuid((await context.params).id),
        await readJson(request, commentSchema),
      ),
      201,
    );
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
