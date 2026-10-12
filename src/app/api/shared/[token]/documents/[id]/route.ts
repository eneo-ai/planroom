import { getSharedDocument } from "@/server/documents";
import { api, json, uuid } from "@/server/http";
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; id: string }> },
) {
  return api(async () => {
    const { token, id } = await context.params;
    return json(await getSharedDocument(token, uuid(id)));
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
