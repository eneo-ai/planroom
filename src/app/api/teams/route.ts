import { namedEntityInputSchema } from "@/contracts";
import { createTeam, listTeams } from "@/server/teams";
import { api, json, readJson, requirePrincipal } from "@/server/http";
export async function GET(request: Request) {
  return api(async () =>
    json({ teams: await listTeams(await requirePrincipal(request)) }),
  );
}
export async function POST(request: Request) {
  return api(async () =>
    json(
      await createTeam(
        await requirePrincipal(request, { write: true }),
        await readJson(request, namedEntityInputSchema),
      ),
      201,
    ),
  );
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
