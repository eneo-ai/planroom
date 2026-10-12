import { createProjectSchema } from "@/contracts";
import { createProject, listProjects } from "@/server/projects";
import { api, json, readJson, requirePrincipal, uuid } from "@/server/http";
export async function GET(request: Request) {
  return api(async () => {
    const teamId = new URL(request.url).searchParams.get("teamId");
    return json({
      projects: await listProjects(
        await requirePrincipal(request),
        teamId ? uuid(teamId) : undefined,
      ),
    });
  });
}
export async function POST(request: Request) {
  return api(async () =>
    json(
      await createProject(
        await requirePrincipal(request, { write: true }),
        await readJson(request, createProjectSchema),
      ),
      201,
    ),
  );
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
