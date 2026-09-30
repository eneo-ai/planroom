// Apply any host supervisor required by AGENTS.md when invoking this script.
// Docker Desktop's VM needs separate container limits from the CLI process.
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../", import.meta.url));
const builder = `planroom-build-${randomUUID()}`;
const interrupted = new AbortController();
const existingContainers = new Set();
let starting = false;
let success = false;
let builderAttempted = false;

function inspectContainers() {
  const result = spawnSync(
    "docker",
    ["compose", "ps", "--all", "--quiet", "app", "db"],
    {
      cwd: directory,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error("Could not inspect Planroom containers.");
  return result.stdout.trim().split(/\s+/).filter(Boolean);
}

function clean() {
  const removed =
    builderAttempted &&
    spawnSync("docker", ["buildx", "rm", "--force", builder], {
      cwd: directory,
      stdio: "ignore",
      timeout: 15_000,
    });
  if (removed && removed.status !== 0) {
    console.error(
      "Could not remove the temporary Docker builder. Check Docker before retrying.",
    );
    process.exitCode = 1;
  }
  if (!starting || success) return;
  try {
    const created = inspectContainers().filter(
      (id) => !existingContainers.has(id),
    );
    if (created.length) {
      const result = spawnSync("docker", ["rm", "--force", ...created], {
        cwd: directory,
        stdio: "inherit",
        timeout: 20_000,
      });
      if (result.status !== 0) throw new Error("Container cleanup failed.");
    }
  } catch {
    console.error(
      "Could not clean up task-created containers. Inspect docker compose ps before retrying.",
    );
    process.exitCode = 1;
  }
}

function run(args) {
  return new Promise((resolve, reject) => {
    const job = spawn("docker", args, {
      cwd: directory,
      stdio: "inherit",
      signal: interrupted.signal,
    });
    let failure;
    job.once("error", (error) => {
      failure = error;
      if (!job.pid) reject(error);
    });
    job.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            failure ??
              new Error(
                `Docker ${args.slice(0, 2).join(" ")} failed (exit ${code}).`,
              ),
          ),
    );
  });
}

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    interrupted.abort();
  });

try {
  await run(["compose", "config", "--quiet"]);
  for (const id of inspectContainers()) existingContainers.add(id);
  builderAttempted = true;
  await run([
    "buildx",
    "create",
    "--name",
    builder,
    "--driver",
    "docker-container",
    "--driver-opt",
    "memory=2g,memory-swap=2g,cpu-period=100000,cpu-quota=100000,default-load=true",
    "--bootstrap",
  ]);
  await run(["compose", "build", "--builder", builder, "app"]);
  starting = true;
  await run([
    "compose",
    "up",
    "--no-build",
    "--wait",
    "--wait-timeout",
    "90",
    "app",
  ]);
  success = true;
  console.log(
    "Planroom is running. Open APP_URL from .env (default http://localhost:3210).",
  );
} catch (error) {
  console.error(
    interrupted.signal.aborted
      ? "Startup interrupted."
      : error instanceof Error
        ? error.message
        : "Docker startup failed.",
  );
  process.exitCode ??= 1;
} finally {
  clean();
}
