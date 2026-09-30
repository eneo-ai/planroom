import { db } from "@/server/db";
import { json } from "@/server/http";
export async function GET() {
  try {
    await db.query("SELECT 1");
    return json({ status: "ok" });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
