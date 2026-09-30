import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set before starting Planroom.");
}

const attempts = 20;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 2_000,
    query_timeout: 2_000,
  });
  let ready = false;
  try {
    await client.connect();
    await client.query("SELECT 1");
    ready = true;
  } catch {
    // Do not log errors that might contain credentials or the connection URL.
    if (attempt === attempts) {
      throw new Error(
        "PostgreSQL did not become available within the startup deadline.",
      );
    }
    console.error(`Waiting for PostgreSQL (${attempt}/${attempts}).`);
  } finally {
    await client.end().catch(() => {});
  }
  if (ready) break;
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
