// A foreground Docker test fixture stays attached to the supervised process.
// Docker Desktop containers also have explicit memory/CPU limits; the host
// supervisor does not account for Docker VM process trees as test children.
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";

const name = `planroom-test-${process.pid}`;
const password = randomBytes(24).toString("hex");
const image = "postgres:17-bookworm";
let fixture;
let connection;
let cleanupDone = false;
function command(args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 512 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `Docker ${args[0]} failed: ${result.stderr?.slice(0, 2000) ?? result.error?.message}`,
    );
  return result.stdout.trim();
}
function cleanup() {
  if (cleanupDone) return;
  cleanupDone = true;
  spawnSync("docker", ["rm", "--force", name], {
    stdio: "ignore",
    timeout: 10000,
  });
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    cleanup();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });

try {
  fixture = spawn(
    "docker",
    [
      "run",
      "--rm",
      "--name",
      name,
      "--memory=512m",
      "--cpus=1",
      "--pids-limit=128",
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "-e",
      "POSTGRES_USER=planroom",
      "-e",
      "POSTGRES_DB=planroom_test",
      "-p",
      "127.0.0.1::5432",
      image,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let failure = "";
  fixture.stderr.on("data", (chunk) => {
    failure = (failure + chunk.toString()).slice(-4000);
  });
  let url;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (fixture.exitCode !== null)
      throw new Error(`Test database exited: ${failure}`);
    try {
      const port = command([
        "inspect",
        "--format",
        '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
        name,
      ]);
      url = `postgres://planroom:${password}@127.0.0.1:${port}/planroom_test`;
      connection = new Pool({
        connectionString: url,
        max: 1,
        connectionTimeoutMillis: 1000,
      });
      await connection.query("SELECT 1");
      break;
    } catch {
      await connection?.end();
      connection = undefined;
      url = undefined;
      await delay(500);
    }
  }
  if (!url) throw new Error(`Test database did not become ready: ${failure}`);
  await connection.end();
  connection = undefined;
  const runner = spawn(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--maxWorkers=1",
      "tests/documents.integration.test.ts",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: url,
        TEST_DATABASE_URL: url,
        APP_URL: "http://localhost:3210",
      },
    },
  );
  const exit = await new Promise((resolve, reject) => {
    runner.once("error", reject);
    runner.once("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = exit;
} finally {
  await connection?.end();
  cleanup();
  if (fixture && fixture.exitCode === null)
    await new Promise((resolve) => fixture.once("exit", resolve));
}
