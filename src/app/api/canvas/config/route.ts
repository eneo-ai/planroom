import { api, json, requirePrincipal } from "@/server/http";

// SDK licenses are public browser configuration, not provider/API credentials.
export async function GET(request: Request) {
  return api(async () => {
    await requirePrincipal(request);
    return json({ licenseKey: process.env.TLDRAW_LICENSE_KEY?.trim() || null });
  });
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
