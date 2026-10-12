import { getSharedProject } from "@/server/projects";
import { api, json } from "@/server/http";
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return api(async () =>
    json(await getSharedProject((await context.params).token)),
  );
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
