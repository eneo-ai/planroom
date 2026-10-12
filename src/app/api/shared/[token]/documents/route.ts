import { listSharedDocuments, nextDocumentCursor } from "@/server/documents";
import { api, json } from "@/server/http";
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return api(async () => {
    const documents = await listSharedDocuments(
      (await context.params).token,
      new URL(request.url).searchParams.get("cursor") ?? undefined,
    );
    return json({ documents, nextCursor: nextDocumentCursor(documents) });
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
