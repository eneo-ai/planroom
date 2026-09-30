import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const temporary: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "planroom-configure-"));
  temporary.push(directory);
  await mkdir(join(directory, "scripts"));
  const script = join(directory, "scripts", "configure.mjs");
  await copyFile(
    fileURLToPath(new URL("../scripts/configure.mjs", import.meta.url)),
    script,
  );
  return { directory, script, environment: join(directory, ".env") };
}
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("private first-run configuration", () => {
  it("creates separate random secrets without printing them or depending on the caller directory", async () => {
    const target = await fixture();
    const run = spawnSync(process.execPath, [target.script], {
      cwd: tmpdir(),
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(run.status).toBe(0);
    const content = await readFile(target.environment, "utf8");
    const database = content.match(/^POSTGRES_PASSWORD=([a-f0-9]{48})$/m)?.[1];
    const bootstrap = content.match(
      /^SEED_ADMIN_PASSWORD=([a-f0-9]{48})$/m,
    )?.[1];
    expect(database).toBeDefined();
    expect(bootstrap).toBeDefined();
    expect(database).not.toBe(bootstrap);
    expect(run.stdout + run.stderr).not.toContain(database);
    expect(run.stdout + run.stderr).not.toContain(bootstrap);
    if (process.platform !== "win32")
      expect((await stat(target.environment)).mode & 0o077).toBe(0);
    expect(content).toContain("PLANROOM_BIND_ADDRESS=127.0.0.1");
  });
  it("preserves an existing configuration byte-for-byte", async () => {
    const target = await fixture();
    const existing =
      "# Maintained manually\nAPP_URL=https://planroom.example\n";
    await writeFile(target.environment, existing, { mode: 0o600 });
    const run = spawnSync(process.execPath, [target.script], {
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(run.status).toBe(0);
    expect(await readFile(target.environment, "utf8")).toBe(existing);
    expect(run.stdout).toContain("already exists");
  });
});
