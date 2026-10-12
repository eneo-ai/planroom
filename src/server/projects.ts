import { randomUUID, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  NamedEntityUpdate,
  NamedEntityInput,
  Project,
  TeamRole,
  ProjectSharing,
  ProjectSharingUpdate,
  SharedProject,
} from "../contracts";
import {
  effectiveTeamRole,
  lockWritePrincipal,
  requireTeamAccess,
  requireTeamOwner,
  teamAccessParameters,
  teamAccessPredicate,
  type Principal,
} from "./auth";
import { publicShareTokenSchema } from "../contracts";
import { db, transaction } from "./db";
import { AppError, notFound } from "./errors";

interface ProjectRow {
  id: string;
  team_id: string;
  team_name: string;
  name: string;
  description: string;
  version: number;
  role: TeamRole | null;
}
const select = `SELECT p.id,p.team_id,p.name,p.description,p.version,t.name AS team_name,m.role FROM projects p JOIN teams t ON t.id=p.team_id LEFT JOIN team_memberships m ON m.team_id=t.id AND m.user_id=$1`;
function project(row: ProjectRow, principal: Principal): Project {
  return {
    id: row.id,
    teamId: row.team_id,
    teamName: row.team_name,
    name: row.name,
    description: row.description,
    version: row.version,
    role: effectiveTeamRole(principal, row.role),
  };
}
export async function listProjects(
  principal: Principal,
  teamId?: string,
): Promise<Project[]> {
  if (teamId) await requireTeamAccess(db, principal, teamId);
  return (
    await db.query<ProjectRow>(
      `${select} WHERE ${teamAccessPredicate} AND ($4::uuid IS NULL OR p.team_id=$4) ORDER BY p.name,p.id`,
      [...teamAccessParameters(principal), teamId ?? null],
    )
  ).rows.map((row) => project(row, principal));
}
export async function getProject(
  principal: Principal,
  id: string,
  client: Pick<PoolClient, "query"> = db,
): Promise<Project> {
  const row = (
    await client.query<ProjectRow>(
      `${select} WHERE ${teamAccessPredicate} AND p.id=$4`,
      [...teamAccessParameters(principal), id],
    )
  ).rows[0];
  return row ? project(row, principal) : notFound();
}
export async function lockProjectAccess(
  client: PoolClient,
  principal: Principal,
  id: string,
): Promise<Project> {
  const current = await getProject(principal, id, client);
  const role = await requireTeamAccess(
    client,
    principal,
    current.teamId,
    true,
    "share",
  );
  return { ...current, role };
}
export async function createProject(
  principal: Principal,
  input: NamedEntityInput & { teamId: string },
): Promise<Project> {
  return transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    await requireTeamAccess(client, verified, input.teamId, true, "share");
    const id = randomUUID();
    await client.query(
      "INSERT INTO projects(id,team_id,name,description) VALUES($1,$2,$3,$4)",
      [id, input.teamId, input.name, input.description],
    );
    return getProject(verified, id, client);
  });
}
export async function updateProject(
  principal: Principal,
  id: string,
  input: NamedEntityUpdate,
): Promise<Project> {
  return transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    await lockProjectAccess(client, verified, id);
    const result = await client.query(
      "UPDATE projects SET name=$2,description=$3,version=version+1 WHERE id=$1 AND version=$4 RETURNING id",
      [id, input.name, input.description, input.expectedVersion],
    );
    if (!result.rows[0])
      throw new AppError(
        409,
        "VERSION_CONFLICT",
        "Projektet har uppdaterats. Hämta det igen innan du sparar.",
      );
    return getProject(verified, id, client);
  });
}

interface SharingRow {
  public_share_token: string | null;
  public_share_version: number;
}
function sharing(row: SharingRow): ProjectSharing {
  return {
    path:
      row.public_share_token === null
        ? null
        : `/shared/${row.public_share_token}`,
    version: row.public_share_version,
  };
}
export async function getProjectSharing(
  principal: Principal,
  id: string,
): Promise<ProjectSharing> {
  return transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    const project = await getProject(verified, id, client);
    await requireTeamOwner(client, verified, project.teamId, "share");
    const row = (
      await client.query<SharingRow>(
        "SELECT public_share_token,public_share_version FROM projects WHERE id=$1",
        [id],
      )
    ).rows[0];
    return sharing(row);
  });
}
export async function updateProjectSharing(
  principal: Principal,
  id: string,
  input: ProjectSharingUpdate,
): Promise<ProjectSharing> {
  return transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    const project = await getProject(verified, id, client);
    await requireTeamOwner(client, verified, project.teamId, "share");
    const current = (
      await client.query<SharingRow>(
        "SELECT public_share_token,public_share_version FROM projects WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (current.public_share_version !== input.expectedVersion)
      throw new AppError(
        409,
        "SHARING_CONFLICT",
        "Delningen har ändrats. Hämta aktuell inställning innan du försöker igen.",
      );
    if (
      (input.action === "enable" && current.public_share_token !== null) ||
      (input.action === "disable" && current.public_share_token === null)
    )
      return sharing(current);
    if (input.action === "rotate" && current.public_share_token === null)
      throw new AppError(
        409,
        "SHARING_DISABLED",
        "Aktivera delning innan du byter länk.",
      );
    const token =
      input.action === "disable" ? null : randomBytes(32).toString("base64url");
    const next = (
      await client.query<SharingRow>(
        "UPDATE projects SET public_share_token=$2,public_share_version=public_share_version+1 WHERE id=$1 RETURNING public_share_token,public_share_version",
        [id, token],
      )
    ).rows[0];
    return sharing(next);
  });
}
export function assertPublicShareToken(token: string): void {
  if (!publicShareTokenSchema.safeParse(token).success) notFound();
}
export async function getSharedProject(token: string): Promise<SharedProject> {
  assertPublicShareToken(token);
  const row = (
    await db.query<SharedProject>(
      "SELECT name,description FROM projects WHERE public_share_token=$1",
      [token],
    )
  ).rows[0];
  return row ?? notFound();
}
