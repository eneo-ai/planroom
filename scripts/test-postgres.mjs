// A foreground Docker test fixture stays attached to the supervised process.
// Docker Desktop containers also have explicit memory/CPU limits; the host
// supervisor does not account for Docker VM process trees as test children.
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { fileURLToPath } from "node:url";

const name = `planroom-test-${randomUUID()}`;
const password = randomBytes(24).toString("hex");
const image =
  "postgres:17-bookworm@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652";
const directory = fileURLToPath(new URL("../", import.meta.url));
let fixture;
let runner;
let fixtureError;
let connection;
let cleanupDone = false;
const interrupted = new AbortController();
let interruptedExitCode;
function command(args) {
  const result = spawnSync("docker", args, {
    cwd: directory,
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
  if (!fixture?.pid) return;
  const removed = spawnSync("docker", ["rm", "--force", name], {
    encoding: "utf8",
    maxBuffer: 16 * 1024,
    timeout: 10000,
  });
  // The attached --rm fixture may already have removed itself after a signal.
  const alreadyRemoved =
    !removed.error &&
    removed.status === 1 &&
    /No such (?:container|object):/.test(removed.stderr ?? "");
  if (removed.error || (removed.status !== 0 && !alreadyRemoved)) {
    console.error(
      `Could not remove disposable test container ${name}: Docker cleanup failed or timed out. Inspect this task-owned container before retrying.`,
    );
    process.exitCode = 1;
  }
}
async function stopOwnedChild(child, description) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  if (!child.killed) child.kill("SIGTERM");
  await new Promise((resolve) => {
    const deadline = setTimeout(() => {
      console.error(
        `${description} did not exit after shutdown; terminating the task-owned process.`,
      );
      process.exitCode = 1;
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("close", () => {
      clearTimeout(deadline);
      resolve();
    });
  });
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (interrupted.signal.aborted) return;
    interruptedExitCode = signal === "SIGINT" ? 130 : 143;
    interrupted.abort();
    runner?.kill("SIGTERM");
    fixture?.kill("SIGTERM");
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
  fixture.once("error", (error) => {
    fixtureError = error;
  });
  let failure = "";
  fixture.stderr.on("data", (chunk) => {
    failure = (failure + chunk.toString()).slice(-4000);
  });
  let url;
  for (let attempt = 0; attempt < 90; attempt++) {
    interrupted.signal.throwIfAborted();
    if (fixtureError)
      throw new Error("Could not start the disposable Docker test database.");
    if (fixture.exitCode !== null)
      throw new Error(
        `Test database exited: ${failure.replaceAll(password, "[redacted]")}`,
      );
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
        query_timeout: 1000,
      });
      await connection.query("SELECT 1");
      break;
    } catch {
      await connection?.end();
      connection = undefined;
      url = undefined;
      await delay(500, undefined, { signal: interrupted.signal });
    }
  }
  if (!url)
    throw new Error(
      `Test database did not become ready: ${failure.replaceAll(password, "[redacted]")}`,
    );
  await connection.end();
  connection = undefined;
  runner = spawn(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--pool=threads",
      "--maxWorkers=1",
      "tests/documents.integration.test.ts",
    ],
    {
      cwd: directory,
      stdio: "inherit",
      signal: interrupted.signal,
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
  process.exitCode = interruptedExitCode ?? exit;
} catch (error) {
  console.error(
    interrupted.signal.aborted
      ? "Disposable PostgreSQL validation interrupted. Cleaning up task-owned resources."
      : error instanceof Error
        ? error.message.replaceAll(password, "[redacted]").slice(0, 4_000)
        : "Disposable PostgreSQL validation failed.",
  );
  process.exitCode = interruptedExitCode ?? 1;
} finally {
  try {
    await connection?.end();
  } catch {
    console.error("Could not close the disposable test database connection.");
    process.exitCode = 1;
  }
  cleanup();
  await stopOwnedChild(runner, "The integration test runner");
  await stopOwnedChild(fixture, "The disposable Docker fixture CLI");
}
