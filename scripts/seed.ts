import { db } from "../src/server/db";
import { seedBootstrap } from "../src/server/bootstrap";
async function main() {
  try {
    await seedBootstrap();
    console.log("One-time bootstrap complete.");
  } finally {
    await db.end();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Bootstrap failed");
  process.exitCode = 1;
});
