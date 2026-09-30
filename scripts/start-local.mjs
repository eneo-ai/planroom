// Run through run-guarded.py on this Mac. The build container needs its own
// limit because Docker Desktop work happens inside a VM outside our CLI tree.
import { spawn, spawnSync } from "node:child_process";
const builder = `planroom-build-${process.pid}`;
let starting = false;
let success = false;
let cleaned = false;
let preexisting = false;
function clean() {
  if (cleaned) return;
  cleaned = true;
  spawnSync("docker", ["buildx", "rm", "--force", builder], {
    stdio: "ignore",
    timeout: 15000,
  });
  if (starting && !success && !preexisting)
    spawnSync("docker", ["compose", "down"], {
      stdio: "inherit",
      timeout: 20000,
    });
}
function run(args) {
  return new Promise((resolve, reject) => {
    const job = spawn("docker", args, { stdio: "inherit" });
    job.once("error", reject);
    job.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Docker ${args.slice(0, 2).join(" ")} failed (exit ${code}).`,
            ),
          ),
    );
  });
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clean();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
try {
  await run(["compose", "config", "--quiet"]);
  const existing = spawnSync("docker", ["compose", "ps", "--all", "--quiet"], {
    encoding: "utf8",
    timeout: 10000,
  });
  if (existing.status !== 0)
    throw new Error("Could not inspect existing Planroom containers.");
  preexisting = Boolean(existing.stdout.trim());
  await run([
    "buildx",
    "create",
    "--name",
    builder,
    "--driver",
    "docker-container",
    "--driver-opt",
    "memory=2g,memory-swap=2g,cpu-period=100000,cpu-quota=100000",
    "--bootstrap",
  ]);
  await run(["compose", "build", "--builder", builder, "app"]);
  starting = true;
  await run(["compose", "up", "--no-build", "--wait", "--wait-timeout", "90"]);
  success = true;
  console.log(
    "Planroom is running. Open the APP_URL configured in .env (default http://localhost:3210).",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Docker startup failed.",
  );
  process.exitCode = 1;
} finally {
  clean();
}
