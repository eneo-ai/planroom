import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../.env", import.meta.url));
const content = `# Generated locally. Keep private; never commit this file.\nPOSTGRES_PASSWORD=${randomBytes(24).toString("hex")}\nSEED_ADMIN_EMAIL=admin@planroom.local\nSEED_ADMIN_PASSWORD=${randomBytes(24).toString("hex")}\nSEED_EXAMPLE=true\nAPP_URL=http://localhost:3210\nPLANROOM_PORT=3210\nPLANROOM_BIND_ADDRESS=127.0.0.1\n`;
try {
  await writeFile(path, content, { flag: "wx", mode: 0o600 });
  console.log("Created .env with unique database and initial admin passwords.");
  console.log(
    "Initial account: admin@planroom.local. Read SEED_ADMIN_PASSWORD in .env.",
  );
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "EEXIST") {
    console.log(
      ".env already exists; keeping your configuration and passwords.",
    );
  } else {
    throw error;
  }
}
