import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ApiToken, Role, User } from "../contracts";
import { db, transaction } from "./db";
import { AppError, isUniqueViolation } from "./errors";
import { hashPassword, verifyPassword } from "./passwords";

export interface Principal {
  user: User;
  authentication: "session" | "token";
  scope: "read" | "write";
  /** Internal credential reference; never serialized in public user contracts. */
  sessionHash?: string;
}
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  must_change_password: boolean;
  password_hash: string;
}
interface TokenRow {
  id: string;
  name: string;
  scope: "read" | "write";
  created_at: Date;
  last_used_at: Date | null;
}
export const SESSION_COOKIE = "planroom_session";
export function secretHash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
export function userFromRow(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    mustChangePassword: row.must_change_password,
  };
}
function tokenFromRow(row: TokenRow): ApiToken {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
  };
}
function cookieSecret(request: Request): string | null {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return cookie?.slice(SESSION_COOKIE.length + 1) ?? null;
}
export function sessionCookie(secret: string, expired = false): string {
  const secure = (process.env.APP_URL ?? "http://localhost:3000").startsWith(
    "https:",
  );
  return `${SESSION_COOKIE}=${expired ? "" : secret}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${expired ? 0 : 604800}${secure ? "; Secure" : ""}`;
}
export function assertReady(principal: Principal): void {
  if (principal.user.mustChangePassword)
    throw new AppError(
      403,
      "ACCOUNT_SETUP_REQUIRED",
      "Byt startkontots uppgifter innan du fortsätter.",
    );
}
export function assertWrite(principal: Principal): void {
  assertReady(principal);
  if (principal.user.role === "viewer" || principal.scope !== "write")
    throw new AppError(403, "FORBIDDEN", "Du har endast läsbehörighet.");
}
export function assertAdmin(principal: Principal): void {
  assertWrite(principal);
  if (principal.authentication !== "session")
    throw new AppError(
      403,
      "SESSION_REQUIRED",
      "Hantera användare via en inloggad webbsession.",
    );
  if (principal.user.role !== "admin")
    throw new AppError(403, "FORBIDDEN", "Administratörsbehörighet krävs.");
}
export function assertSameOrigin(request: Request): void {
  const configured = process.env.APP_URL;
  if (!configured)
    throw new AppError(
      503,
      "CONFIGURATION_ERROR",
      "APP_URL måste konfigureras.",
    );
  if (request.headers.get("origin") !== new URL(configured).origin)
    throw new AppError(
      403,
      "INVALID_ORIGIN",
      "Begäran måste komma från tjänstens egen sida.",
    );
}
export async function findPrincipal(
  request: Request,
  tokenOnly = false,
): Promise<Principal | null> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const result = await db.query<
      UserRow & { scope: "read" | "write"; token_id: string }
    >(
      "SELECT u.*, t.scope, t.id AS token_id FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.secret_hash=$1",
      [secretHash(authorization.slice(7))],
    );
    const row = result.rows[0];
    if (!row) return null;
    await db.query("UPDATE api_tokens SET last_used_at=now() WHERE id=$1", [
      row.token_id,
    ]);
    return {
      user: userFromRow(row),
      authentication: "token",
      scope: row.scope,
    };
  }
  if (tokenOnly) return null;
  const secret = cookieSecret(request);
  if (!secret) return null;
  const result = await db.query<UserRow>(
    "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.secret_hash=$1 AND s.expires_at>now()",
    [secretHash(secret)],
  );
  return result.rows[0]
    ? {
        user: userFromRow(result.rows[0]),
        authentication: "session",
        scope: "write",
        sessionHash: secretHash(secret),
      }
    : null;
}
export async function requirePrincipal(
  request: Request,
  options: {
    write?: boolean;
    allowPasswordChange?: boolean;
    tokenOnly?: boolean;
  } = {},
): Promise<Principal> {
  const principal = await findPrincipal(request, options.tokenOnly);
  if (!principal)
    throw new AppError(401, "UNAUTHENTICATED", "Logga in för att fortsätta.");
  if (!options.allowPasswordChange) assertReady(principal);
  if (options.write) {
    if (principal.authentication === "session") assertSameOrigin(request);
    assertWrite(principal);
  }
  return principal;
}
export async function login(
  email: string,
  password: string,
): Promise<{ user: User; secret: string }> {
  await db.query(
    "DELETE FROM login_attempts WHERE window_start<now()-interval '15 minutes'",
  );
  const attempt = await db.query<{ attempts: number }>(
    `INSERT INTO login_attempts(subject_hash,attempts,window_start) VALUES($1,1,now())
    ON CONFLICT(subject_hash) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,
    window_start=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING attempts`,
    [secretHash(email)],
  );
  if (attempt.rows[0].attempts > 10)
    throw new AppError(
      429,
      "RATE_LIMITED",
      "För många inloggningsförsök. Försök igen om 15 minuter.",
    );
  return transaction(async (client) => {
    // Serialize verification and issuance with account replacement. A login
    // using old credentials either precedes rotation and is revoked, or fails.
    const result = await client.query<UserRow>(
      "SELECT * FROM users WHERE email=$1 FOR UPDATE",
      [email],
    );
    const row = result.rows[0];
    const fallback =
      "scrypt$00000000000000000000000000000000$" + "0".repeat(128);
    const matches = await verifyPassword(
      password,
      row?.password_hash ?? fallback,
    );
    if (!row || !matches)
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Fel e-postadress eller lösenord.",
      );
    await client.query("DELETE FROM login_attempts WHERE subject_hash=$1", [
      secretHash(email),
    ]);
    const secret = randomBytes(32).toString("base64url");
    await client.query("DELETE FROM sessions WHERE expires_at<=now()");
    await client.query(
      "INSERT INTO sessions(secret_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [secretHash(secret), row.id],
    );
    return { user: userFromRow(row), secret };
  });
}
async function lockSessionUser(
  client: PoolClient,
  principal: Principal,
): Promise<UserRow> {
  if (principal.authentication !== "session" || !principal.sessionHash)
    throw new AppError(401, "UNAUTHENTICATED", "En aktiv webbsession krävs.");
  const row = (
    await client.query<UserRow>("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
      principal.user.id,
    ])
  ).rows[0];
  const session = (
    await client.query(
      "SELECT secret_hash FROM sessions WHERE secret_hash=$1 AND user_id=$2 AND expires_at>now()",
      [principal.sessionHash, principal.user.id],
    )
  ).rows[0];
  if (!row || !session)
    throw new AppError(
      401,
      "UNAUTHENTICATED",
      "Sessionen har avslutats. Logga in igen.",
    );
  return row;
}
export async function logout(request: Request): Promise<void> {
  const secret = cookieSecret(request);
  if (secret)
    await db.query("DELETE FROM sessions WHERE secret_hash=$1", [
      secretHash(secret),
    ]);
}
export async function replaceAccount(
  principal: Principal,
  input: {
    name: string;
    email: string;
    currentPassword: string;
    password: string;
  },
): Promise<{ user: User; secret: string }> {
  if (principal.authentication !== "session")
    throw new AppError(
      403,
      "SESSION_REQUIRED",
      "Ändra kontot via en inloggad webbsession.",
    );
  const passwordHash = await hashPassword(input.password);
  const secret = randomBytes(32).toString("base64url");
  try {
    return await transaction(async (client) => {
      const row = await lockSessionUser(client, principal);
      if (!(await verifyPassword(input.currentPassword, row.password_hash)))
        throw new AppError(
          401,
          "INVALID_CREDENTIALS",
          "Nuvarande lösenord stämmer inte.",
        );
      if (input.currentPassword === input.password)
        throw new AppError(
          400,
          "PASSWORD_UNCHANGED",
          "Välj ett nytt lösenord.",
        );
      if (
        row.must_change_password &&
        row.email === "admin@planroom.local" &&
        input.email === row.email
      )
        throw new AppError(
          400,
          "EMAIL_UNCHANGED",
          "Byt startkontots e-postadress till din riktiga adress.",
        );
      const updated = await client.query<UserRow>(
        "UPDATE users SET name=$2,email=$3,password_hash=$4,must_change_password=false WHERE id=$1 RETURNING *",
        [row.id, input.name, input.email, passwordHash],
      );
      await client.query("DELETE FROM sessions WHERE user_id=$1", [row.id]);
      await client.query("DELETE FROM api_tokens WHERE user_id=$1", [row.id]);
      await client.query(
        "INSERT INTO sessions(secret_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
        [secretHash(secret), row.id],
      );
      return { user: userFromRow(updated.rows[0]), secret };
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new AppError(409, "EMAIL_IN_USE", "E-postadressen används redan.");
    throw error;
  }
}
export async function listTokens(principal: Principal): Promise<ApiToken[]> {
  assertReady(principal);
  const result = await db.query<TokenRow>(
    "SELECT * FROM api_tokens WHERE user_id=$1 ORDER BY created_at DESC",
    [principal.user.id],
  );
  return result.rows.map(tokenFromRow);
}
export async function createToken(
  principal: Principal,
  input: { name: string; scope: "read" | "write" },
): Promise<{ token: string; record: ApiToken }> {
  assertReady(principal);
  if (principal.authentication !== "session")
    throw new AppError(
      403,
      "SESSION_REQUIRED",
      "Hantera API-nycklar i webbsidan.",
    );
  if (input.scope === "write") assertWrite(principal);
  const token = `pr_${randomBytes(32).toString("base64url")}`;
  return transaction(async (client) => {
    const row = await lockSessionUser(client, principal);
    const current: Principal = { ...principal, user: userFromRow(row) };
    assertReady(current);
    if (input.scope === "write") assertWrite(current);
    const result = await client.query<TokenRow>(
      "INSERT INTO api_tokens(id,user_id,name,scope,secret_hash) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [randomUUID(), row.id, input.name, input.scope, secretHash(token)],
    );
    return { token, record: tokenFromRow(result.rows[0]) };
  });
}
export async function deleteToken(
  principal: Principal,
  id: string,
): Promise<void> {
  assertReady(principal);
  if (principal.authentication !== "session")
    throw new AppError(
      403,
      "SESSION_REQUIRED",
      "Hantera API-nycklar i webbsidan.",
    );
  await db.query("DELETE FROM api_tokens WHERE id=$1 AND user_id=$2", [
    id,
    principal.user.id,
  ]);
}
export async function listUsers(principal: Principal): Promise<User[]> {
  assertAdmin(principal);
  return (
    await db.query<UserRow>("SELECT * FROM users ORDER BY created_at")
  ).rows.map(userFromRow);
}
export async function createUser(
  principal: Principal,
  input: { name: string; email: string; password: string; role: Role },
): Promise<User> {
  assertAdmin(principal);
  try {
    const passwordHash = await hashPassword(input.password);
    return transaction(async (client) => {
      const current = await lockSessionUser(client, principal);
      assertAdmin({ ...principal, user: userFromRow(current) });
      const result = await client.query<UserRow>(
        "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [randomUUID(), input.name, input.email, passwordHash, input.role],
      );
      return userFromRow(result.rows[0]);
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new AppError(409, "EMAIL_IN_USE", "E-postadressen används redan.");
    throw error;
  }
}
