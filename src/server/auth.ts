import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ApiToken, Role, User } from "../contracts";
import { db, transaction } from "./db";
import { AppError, isUniqueViolation } from "./errors";
import { hashPassword, verifyLoginPassword, verifyPassword } from "./passwords";

/** Credential references are internal and never serialized in public contracts. */
export type Principal = { user: User; scope: "read" | "write" } & (
  | { authentication: "session"; sessionHash: string }
  | { authentication: "token"; tokenHash: string }
);
export interface UserRow {
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
  expires_at: Date;
  token_suffix: string | null;
}
export const SESSION_COOKIE = "planroom_session";
const LOGIN_CONCURRENCY_LIMIT = 4;
let activeLogins = 0;
async function recordLoginAttempt(
  subject: string,
  windowSeconds: number,
  limit: number,
  message: string,
): Promise<void> {
  const result = await db.query<{ attempts: number }>(
    `INSERT INTO login_attempts(subject_hash,attempts,window_start) VALUES($1,1,now())
    ON CONFLICT(subject_hash) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<now()-($2::int * interval '1 second') THEN 1 ELSE login_attempts.attempts+1 END,
    window_start=CASE WHEN login_attempts.window_start<now()-($2::int * interval '1 second') THEN now() ELSE login_attempts.window_start END RETURNING attempts`,
    [secretHash(subject), windowSeconds],
  );
  if (result.rows[0].attempts > limit)
    throw new AppError(429, "RATE_LIMITED", message);
}
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
    expiresAt: row.expires_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    maskedToken:
      row.token_suffix === null ? null : `********${row.token_suffix}`,
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
  const secure =
    new URL(process.env.APP_URL ?? "http://localhost:3000").protocol ===
    "https:";
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
  if (authorization !== null) {
    // An explicit authentication header selects its own identity. Never fall
    // back to a stronger cookie principal for malformed or invalid credentials.
    const bearer = /^Bearer +(\S+)$/i.exec(authorization);
    if (!bearer) return null;
    const tokenHash = secretHash(bearer[1]);
    const result = await db.query<
      UserRow & { scope: "read" | "write"; token_id: string }
    >(
      "SELECT u.*, t.scope, t.id AS token_id FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.secret_hash=$1 AND t.expires_at>clock_timestamp()",
      [tokenHash],
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
      tokenHash,
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
  if (activeLogins >= LOGIN_CONCURRENCY_LIMIT)
    throw new AppError(
      429,
      "AUTH_BUSY",
      "För många samtidiga inloggningar. Försök igen om en stund.",
    );
  activeLogins++;
  try {
    await db.query(
      "DELETE FROM login_attempts WHERE window_start<now()-interval '10 minutes'",
    );
    // Consumed before an arbitrary email row or password work is admitted.
    await recordLoginAttempt(
      "login:global",
      60,
      60,
      "Inloggningstjänstens gräns har nåtts. Försök igen om en minut.",
    );
    const outcome = await transaction(async (client) => {
      // Also serializes the absent-row case. Concurrent attempts for one email
      // cannot verify a sixth password or clear each other's failure counter.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))",
        [email],
      );
      const previous = (
        await client.query<{ attempts: number; active: boolean }>(
          "SELECT attempts, window_start>clock_timestamp()-interval '10 minutes' AS active FROM login_attempts WHERE subject_hash=$1 FOR UPDATE",
          [secretHash(email)],
        )
      ).rows[0];
      const failures = previous?.active ? previous.attempts : 0;
      if (failures >= 5)
        return new AppError(
          429,
          "RATE_LIMITED",
          "Kontot är spärrat efter fem misslyckade försök. Försök igen om tio minuter.",
        );
      // User lock makes old-password verification and session issuance atomic
      // with account replacement and session/key revocation.
      const result = await client.query<UserRow>(
        "SELECT * FROM users WHERE email=$1 FOR UPDATE",
        [email],
      );
      const row = result.rows[0];
      const verification = await verifyLoginPassword(
        password,
        row?.password_hash ?? null,
      );
      if (!row || !verification.matches) {
        await client.query(
          `INSERT INTO login_attempts(subject_hash,attempts,window_start) VALUES($1,$2,clock_timestamp())
         ON CONFLICT(subject_hash) DO UPDATE SET attempts=$2,window_start=CASE WHEN $2=1 OR $2=5 THEN clock_timestamp() ELSE login_attempts.window_start END`,
          [secretHash(email), failures + 1],
        );
        // Return, then throw after commit: failed-login accounting must persist.
        return new AppError(
          401,
          "INVALID_CREDENTIALS",
          "Fel e-postadress eller lösenord.",
        );
      }
      if (verification.upgradedHash !== null) {
        await client.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
          row.id,
          verification.upgradedHash,
        ]);
      }
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
    if (outcome instanceof AppError) throw outcome;
    return outcome;
  } finally {
    activeLogins--;
  }
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
      "SELECT secret_hash FROM sessions WHERE secret_hash=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE",
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
/** Serialize document writes with session/key revocation and role changes. */
export async function lockWritePrincipal(
  client: PoolClient,
  principal: Principal,
): Promise<Principal> {
  let row: UserRow;
  if (principal.authentication === "session")
    row = await lockSessionUser(client, principal);
  else {
    if (!principal.tokenHash)
      throw new AppError(401, "UNAUTHENTICATED", "En aktiv API-nyckel krävs.");
    const current = (
      await client.query<UserRow>(
        "SELECT * FROM users WHERE id=$1 FOR UPDATE",
        [principal.user.id],
      )
    ).rows[0];
    const token = (
      await client.query<{ scope: "read" | "write" }>(
        "SELECT scope FROM api_tokens WHERE secret_hash=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE",
        [principal.tokenHash, principal.user.id],
      )
    ).rows[0];
    if (!current || !token)
      throw new AppError(
        401,
        "UNAUTHENTICATED",
        "API-nyckeln har återkallats. Anslut igen.",
      );
    row = current;
    principal = { ...principal, scope: token.scope };
  }
  const verified: Principal = { ...principal, user: userFromRow(row) };
  assertWrite(verified);
  return verified;
}
export async function logout(request: Request): Promise<void> {
  const secret = cookieSecret(request);
  if (!secret) return;
  const hash = secretHash(secret);
  const session = (
    await db.query<{ user_id: string }>(
      "SELECT user_id FROM sessions WHERE secret_hash=$1",
      [hash],
    )
  ).rows[0];
  if (!session) return;
  await transaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
      session.user_id,
    ]);
    await client.query(
      "DELETE FROM sessions WHERE secret_hash=$1 AND user_id=$2",
      [hash, session.user_id],
    );
  });
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
    "SELECT id,name,scope,created_at,last_used_at,expires_at,token_suffix FROM api_tokens WHERE user_id=$1 ORDER BY created_at DESC",
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
      "INSERT INTO api_tokens(id,user_id,name,scope,secret_hash,token_suffix) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,scope,created_at,last_used_at,expires_at,token_suffix",
      [
        randomUUID(),
        row.id,
        input.name,
        input.scope,
        secretHash(token),
        token.slice(-4),
      ],
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
  await transaction(async (client) => {
    await lockSessionUser(client, principal);
    await client.query("DELETE FROM api_tokens WHERE id=$1 AND user_id=$2", [
      id,
      principal.user.id,
    ]);
  });
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
