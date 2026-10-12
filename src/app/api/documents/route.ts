import { createDocumentSchema, statusSchema } from "@/contracts";
import {
  createDocument,
  listDocuments,
  nextDocumentCursor,
} from "@/server/documents";
import {
  api,
  AppError,
  json,
  readJson,
  requirePrincipal,
  uuid,
} from "@/server/http";
export async function GET(request: Request) {
  return api(async () => {
    const principal = await requirePrincipal(request);
    const query = new URL(request.url).searchParams;
    const status = query.get("status");
    const q = query.get("q") ?? undefined;
    if (q && q.length > 200)
      throw new AppError(400, "VALIDATION_ERROR", "Sökningen är för lång.");
    const cursor = query.get("cursor") ?? undefined;
    if (cursor && cursor.length > 200)
      throw new AppError(400, "VALIDATION_ERROR", "Sidmarkören är för lång.");
    if (status && !statusSchema.safeParse(status).success)
      throw new AppError(400, "VALIDATION_ERROR", "Ogiltig status.");
    const documents = await listDocuments(principal, {
      q,
      status: status ? statusSchema.parse(status) : undefined,
      projectId: query.get("projectId")
        ? uuid(query.get("projectId")!)
        : undefined,
      teamId: query.get("teamId") ? uuid(query.get("teamId")!) : undefined,
      cursor,
    });
    return json({
      documents,
      nextCursor: nextDocumentCursor(documents),
    });
  });
}
export async function POST(request: Request) {
  return api(async () => {
    const principal = await requirePrincipal(request, { write: true });
    return json(
      await createDocument(
        principal,
        await readJson(request, createDocumentSchema),
      ),
      201,
    );
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
