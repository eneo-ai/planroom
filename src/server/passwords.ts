import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";

const PASSWORD_CONCURRENCY_LIMIT = 4;
const SCRYPT_PARAMETERS = {
  legacy: { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
  v2: { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
};
type HashVersion = keyof typeof SCRYPT_PARAMETERS;
interface StoredPassword {
  version: HashVersion;
  salt: string;
  encoded: string;
}
type PasswordMatch =
  { matches: false } | { matches: true; version: HashVersion };
export type LoginPasswordVerification =
  { matches: false } | { matches: true; upgradedHash: string | null };
let activeDerivations = 0;

function parseStoredPassword(stored: string): StoredPassword | null {
  const parts = stored.split("$");
  let parsed: StoredPassword;
  if (parts.length === 4 && parts[0] === "scrypt" && parts[1] === "v2") {
    parsed = { version: "v2", salt: parts[2], encoded: parts[3] };
  } else if (parts.length === 3 && parts[0] === "scrypt") {
    // Remove this persisted-data path only when no legacy hashes remain in
    // deployed users tables and backup restoration upgrades or resets them.
    parsed = { version: "legacy", salt: parts[1], encoded: parts[2] };
  } else return null;
  if (
    parsed.salt.length !== 32 ||
    parsed.encoded.length !== 128 ||
    !/^[a-f0-9]{32}$/.test(parsed.salt) ||
    !/^[a-f0-9]{128}$/.test(parsed.encoded)
  )
    return null;
  return parsed;
}

async function derive(
  password: string,
  salt: string,
  version: HashVersion,
): Promise<Buffer> {
  // All password operations share one nonqueued budget. Hash strings cannot
  // select arbitrary cost parameters; only these fixed versions are supported.
  if (activeDerivations >= PASSWORD_CONCURRENCY_LIMIT)
    throw new AppError(
      429,
      "AUTH_BUSY",
      "Lösenordstjänsten är upptagen. Försök igen om en stund.",
    );
  activeDerivations++;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scrypt(password, salt, 64, SCRYPT_PARAMETERS[version], (error, key) =>
        error ? reject(error) : resolve(key),
      ),
    );
  } finally {
    activeDerivations--;
  }
}

async function matchPassword(
  password: string,
  stored: string | null,
): Promise<PasswordMatch> {
  if (stored === null) {
    // Unknown users consume the current cost without duplicating hash format
    // or crypto policy in the authentication module.
    await derive(password, "0".repeat(32), "v2");
    return { matches: false };
  }
  const parsed = parseStoredPassword(stored);
  if (!parsed) return { matches: false };
  const key = await derive(password, parsed.salt, parsed.version);
  return timingSafeEqual(key, Buffer.from(parsed.encoded, "hex"))
    ? { matches: true, version: parsed.version }
    : { matches: false };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$v2$${salt}$${(await derive(password, salt, "v2")).toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  return (await matchPassword(password, stored)).matches;
}

/** The caller persists upgradedHash under its user lock before issuing a session. */
export async function verifyLoginPassword(
  password: string,
  stored: string | null,
): Promise<LoginPasswordVerification> {
  const result = await matchPassword(password, stored);
  if (!result.matches) return { matches: false };
  return {
    matches: true,
    upgradedHash:
      result.version === "legacy" ? await hashPassword(password) : null,
  };
}
