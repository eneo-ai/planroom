import { createTokenSchema } from "@/contracts";
import { assertSameOrigin, createToken, listTokens } from "@/server/auth";
import { api, json, readJson, requirePrincipal } from "@/server/http";
export async function GET(request: Request) {
  return api(async () =>
    json({ tokens: await listTokens(await requirePrincipal(request)) }),
  );
}
export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const principal = await requirePrincipal(request);
    return json(
      await createToken(principal, await readJson(request, createTokenSchema)),
      201,
    );
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
