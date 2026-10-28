import "dotenv/config";
import { db } from "../src/lib/db";
import { ensureDefaultUser } from "../src/lib/users";

// Creates the default account from DEFAULT_USER_EMAIL / DEFAULT_USER_PASSWORD
// in .env (or resets its password). The pre-W6 dev@localhost user, if still
// there, becomes this account so its documents are kept. Safe to re-run.
// Usage: npm run db:seed
async function main() {
  const user = await ensureDefaultUser();
  console.log(`Default user ready: ${user.email} (${user.id})`);
  await db.$client.end(); // close the DB pool so the script can exit
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "An unknown error occurred.";
  console.error(`Seeding failed: ${message}`);
  process.exitCode = 1;
  void db.$client.end();
});
