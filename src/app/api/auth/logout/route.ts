import { assertSameOrigin, logout, sessionCookie } from "@/server/auth";
import { api, json } from "@/server/http";
export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    await logout(request);
    const response = json({ ok: true });
    response.headers.set("Set-Cookie", sessionCookie("", true));
    return response;
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
