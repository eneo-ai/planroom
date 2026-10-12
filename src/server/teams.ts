import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  NamedEntityInput,
  NamedEntityUpdate,
  Team,
  TeamMember,
  TeamRole,
} from "../contracts";
import {
  assertAdmin,
  assertReady,
  effectiveTeamRole,
  lockWritePrincipal,
  requireTeamAccess,
  requireTeamOwner,
  teamAccessParameters,
  teamAccessPredicate,
  type Principal,
} from "./auth";
import { db, transaction } from "./db";
import { AppError, notFound } from "./errors";

export const initialTeamId = "dca0733b-3325-4efa-9b43-2e71e537b001";
export const initialProjectId = "dca0733b-3325-4efa-9b43-2e71e537b002";
interface TeamRow {
  id: string;
  name: string;
  description: string;
  version: number;
  role: TeamRole | null;
}
const select = `SELECT t.id,t.name,t.description,t.version,m.role FROM teams t LEFT JOIN team_memberships m ON m.team_id=t.id AND m.user_id=$1`;
function team(row: TeamRow, principal: Principal): Team {
  return { ...row, role: effectiveTeamRole(principal, row.role) };
}
export async function listTeams(principal: Principal): Promise<Team[]> {
  const rows = await db.query<TeamRow>(
    `${select} WHERE ${teamAccessPredicate} ORDER BY t.name,t.id`,
    teamAccessParameters(principal),
  );
  return rows.rows.map((row) => team(row, principal));
}
export async function getTeam(principal: Principal, id: string): Promise<Team> {
  const rows = await db.query<TeamRow>(
    `${select} WHERE ${teamAccessPredicate} AND t.id=$4`,
    [...teamAccessParameters(principal), id],
  );
  return rows.rows[0] ? team(rows.rows[0], principal) : notFound();
}
export async function createTeam(
  principal: Principal,
  input: NamedEntityInput,
): Promise<Team> {
  assertAdmin(principal);
  return transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    assertAdmin(verified);
    const row = (
      await client.query<Omit<TeamRow, "role">>(
        "INSERT INTO teams(id,name,description) VALUES($1,$2,$3) RETURNING id,name,description,version",
        [randomUUID(), input.name, input.description],
      )
    ).rows[0];
    await client.query(
      "INSERT INTO team_memberships(team_id,user_id,role) VALUES($1,$2,'owner')",
      [row.id, verified.user.id],
    );
    return { ...row, role: "owner" };
  });
}
export async function updateTeam(
  principal: Principal,
  id: string,
  input: NamedEntityUpdate,
): Promise<Team> {
  return transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    await requireTeamOwner(client, verified, id);
    const row = (
      await client.query<Omit<TeamRow, "role">>(
        "UPDATE teams SET name=$2,description=$3,version=version+1 WHERE id=$1 AND version=$4 RETURNING id,name,description,version",
        [id, input.name, input.description, input.expectedVersion],
      )
    ).rows[0];
    if (!row)
      throw new AppError(
        409,
        "VERSION_CONFLICT",
        "Teamet har uppdaterats. Hämta det igen innan du sparar.",
      );
    return { ...row, role: "owner" };
  });
}
export async function listMembers(
  principal: Principal,
  id: string,
): Promise<TeamMember[]> {
  assertReady(principal);
  if (
    (await requireTeamAccess(db, principal, id)) !== "owner" ||
    principal.authentication !== "session"
  )
    throw new AppError(
      403,
      "FORBIDDEN",
      "Teamägarbehörighet i webbsidan krävs.",
    );
  return (
    await db.query<TeamMember>(
      `SELECT u.id AS "userId",u.name,u.email,member.role FROM teams t LEFT JOIN team_memberships m ON m.team_id=t.id AND m.user_id=$1 JOIN team_memberships member ON member.team_id=t.id JOIN users u ON u.id=member.user_id WHERE ${teamAccessPredicate} AND t.id=$4 AND ($2='global_admin' OR m.role='owner') ORDER BY u.name,u.id`,
      [...teamAccessParameters(principal), id],
    )
  ).rows;
}
async function protectLastOwner(
  client: PoolClient,
  teamId: string,
  userId: string,
  nextRole: TeamRole | null,
): Promise<void> {
  if (nextRole === "owner") return;
  const row = (
    await client.query<{ role: TeamRole }>(
      "SELECT role FROM team_memberships WHERE team_id=$1 AND user_id=$2",
      [teamId, userId],
    )
  ).rows[0];
  if (
    row?.role === "owner" &&
    !(
      await client.query(
        "SELECT user_id FROM team_memberships WHERE team_id=$1 AND role='owner' AND user_id<>$2 LIMIT 1",
        [teamId, userId],
      )
    ).rows[0]
  )
    throw new AppError(
      409,
      "LAST_TEAM_OWNER",
      "Teamet måste ha minst en teamägare.",
    );
}
export async function setMember(
  principal: Principal,
  id: string,
  input: { email: string; role: TeamRole },
): Promise<void> {
  await transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    await requireTeamOwner(client, verified, id);
    const user = (
      await client.query<{ id: string }>(
        "SELECT id FROM users WHERE email=$1",
        [input.email],
      )
    ).rows[0];
    if (!user)
      throw new AppError(
        404,
        "USER_NOT_FOUND",
        "Kontot finns inte. Be globaladmin att skapa kontot först.",
      );
    await protectLastOwner(client, id, user.id, input.role);
    await client.query(
      "INSERT INTO team_memberships(team_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(team_id,user_id) DO UPDATE SET role=excluded.role",
      [id, user.id, input.role],
    );
  });
}
export async function removeMember(
  principal: Principal,
  id: string,
  userId: string,
): Promise<void> {
  await transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    await requireTeamOwner(client, verified, id);
    await protectLastOwner(client, id, userId, null);
    await client.query(
      "DELETE FROM team_memberships WHERE team_id=$1 AND user_id=$2",
      [id, userId],
    );
  });
}
