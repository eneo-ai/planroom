import { loginSchema } from "@/contracts";
import { assertSameOrigin, login, sessionCookie } from "@/server/auth";
import { api, json, readJson } from "@/server/http";
export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, loginSchema);
    const result = await login(input.email, input.password);
    const response = json({ user: result.user });
    response.headers.set("Set-Cookie", sessionCookie(result.secret));
    return response;
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
