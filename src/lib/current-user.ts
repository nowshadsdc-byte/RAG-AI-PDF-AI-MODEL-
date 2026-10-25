import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";

// TEMPORARY until Week 6 (Auth.js). Every query is already scoped by a
// user id; for now that id belongs to one local "dev" user. In W6 this
// function will read the id from the logged-in session instead, and no
// other code has to change.
const devEmail = "dev@localhost";

export async function getCurrentUserId(): Promise<string> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, devEmail));
  if (existing[0]) return existing[0].id;

  // "!" is not a valid bcrypt hash, so nobody can ever log in as this user.
  const [created] = await db
    .insert(users)
    .values({ email: devEmail, passwordHash: "!" })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (created) return created.id;

  // Another request created it at the same moment; read it again.
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, devEmail));
  return row.id;
}
