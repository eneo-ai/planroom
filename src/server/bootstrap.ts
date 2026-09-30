import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  documentContentSchema,
  emailSchema,
  passwordSchema,
} from "../contracts";
import { transaction } from "./db";
import { createDocumentInTransaction } from "./documents";
import { hashPassword } from "./passwords";

/** Persisted markers survive renaming/deleting the original admin. */
export async function seedBootstrap(): Promise<void> {
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(812846391)");
    const seeded = (
      await client.query("SELECT key FROM bootstrap WHERE key='initial-admin'")
    ).rowCount;
    if (seeded) return;
    const existing = (await client.query("SELECT id FROM users LIMIT 1"))
      .rowCount;
    if (existing) {
      await client.query("INSERT INTO bootstrap(key) VALUES('initial-admin')");
      return;
    }
    const email = emailSchema.parse(
      process.env.SEED_ADMIN_EMAIL ?? "admin@planroom.local",
    );
    const password = passwordSchema.parse(process.env.SEED_ADMIN_PASSWORD);
    const id = randomUUID();
    await client.query(
      "INSERT INTO users(id,name,email,password_hash,role,must_change_password) VALUES($1,'Startadministratör',$2,$3,'admin',true)",
      [id, email, await hashPassword(password)],
    );
    if (process.env.SEED_EXAMPLE === "true") {
      const html = await readFile(
        resolve(process.cwd(), "examples/orchestrator.html"),
        "utf8",
      );
      await createDocumentInTransaction(
        client,
        {
          user: {
            id,
            name: "Startadministratör",
            email,
            role: "admin",
            mustChangePassword: false,
          },
          authentication: "session",
          scope: "write",
        },
        documentContentSchema.parse({
          title: "Orkestreraren i Eneo",
          description: "Exempel på en visuell HTML-planering.",
          html,
          instructions:
            "Bevara dokumentets diagram, layout och interaktivitet. Läs senaste versionen före ändringar och beskriv vad som uppdaterats.",
          status: "draft",
          changeSummary: "Importerad exempelplanering vid första uppstarten.",
        }),
      );
    }
    await client.query("INSERT INTO bootstrap(key) VALUES('initial-admin')");
  });
}
