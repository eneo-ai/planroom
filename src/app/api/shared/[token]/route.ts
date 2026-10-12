import { getSharedDocument } from "@/server/documents";
import { api, json } from "@/server/http";
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return api(async () =>
    json(await getSharedDocument((await context.params).token)),
  );
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
