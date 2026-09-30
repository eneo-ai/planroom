import { findPrincipal } from "@/server/auth";
import { api, json } from "@/server/http";
export async function GET(request: Request) {
  return api(async () =>
    json({ user: (await findPrincipal(request))?.user ?? null }),
  );
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
