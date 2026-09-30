import { setupSchema } from "@/contracts";
import {
  assertSameOrigin,
  replaceAccount,
  requirePrincipal,
  sessionCookie,
} from "@/server/auth";
import { api, json, readJson } from "@/server/http";
export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const principal = await requirePrincipal(request, {
      allowPasswordChange: true,
    });
    const result = await replaceAccount(
      principal,
      await readJson(request, setupSchema),
    );
    const response = json({ user: result.user });
    response.headers.set("Set-Cookie", sessionCookie(result.secret));
    return response;
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
