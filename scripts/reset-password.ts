import { emailSchema } from "../src/contracts";
import { resetUserPasswordAsOperator } from "../src/server/auth";
import { db } from "../src/server/db";

async function main() {
  try {
    const args = process.argv.slice(2);
    const email = emailSchema.safeParse(args[0]);
    if (args.length !== 1 || !email.success)
      throw new Error("Usage: npm run user:reset-password -- user@example.com");
    const result = await resetUserPasswordAsOperator(email.data);
    // Print only after commit. Passwords cannot be retrieved on later runs.
    console.log(`User: ${result.user.name} <${result.user.email}>`);
    console.log(`Temporary password: ${result.temporaryPassword}`);
    console.log(`Valid until: ${result.expiresAt} (one login)`);
    console.log(
      "Sessions and API keys revoked. A new password is required before workspace access.",
    );
  } finally {
    await db.end();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Password reset failed",
  );
  process.exitCode = 1;
});
