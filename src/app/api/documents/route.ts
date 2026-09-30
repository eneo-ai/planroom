import { documentContentSchema, statusSchema } from "@/contracts";
import { createDocument, listDocuments } from "@/server/documents";
import { api, AppError, json, readJson, requirePrincipal } from "@/server/http";
export async function GET(request: Request) {
  return api(async () => {
    const principal = await requirePrincipal(request);
    const query = new URL(request.url).searchParams;
    const status = query.get("status");
    const q = query.get("q") ?? undefined;
    if (q && q.length > 200)
      throw new AppError(400, "VALIDATION_ERROR", "Sökningen är för lång.");
    if (status && !statusSchema.safeParse(status).success)
      throw new AppError(400, "VALIDATION_ERROR", "Ogiltig status.");
    return json({
      documents: await listDocuments(principal, {
        q,
        status: status ? statusSchema.parse(status) : undefined,
      }),
    });
  });
}
export async function POST(request: Request) {
  return api(async () => {
    const principal = await requirePrincipal(request, { write: true });
    return json(
      await createDocument(
        principal,
        await readJson(request, documentContentSchema),
      ),
      201,
    );
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
