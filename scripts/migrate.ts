import { db } from "../src/server/db";
import { migrate } from "../src/server/migrate";
async function main() {
  try {
    await migrate();
    console.log("Database migrations complete.");
  } finally {
    await db.end();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Migration failed");
  process.exitCode = 1;
});
