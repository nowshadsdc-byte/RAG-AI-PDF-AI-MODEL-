import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";

// Accounts: registering, checking a password, and the default user.
// Plain DB + bcrypt only (no Next.js / Auth.js imports), so tests and
// terminal scripts can use it directly.

// bcrypt cost: 2^12 rounds ≈ 0.2 s per hash — slow on purpose, so a leaked
// password_hash column cannot be brute-forced quickly. bcryptjs is a pure-JS
// bcrypt (same algorithm and hash format), so nothing native has to compile.
const bcryptRounds = 12;
export const minPasswordLength = 8;

// The temporary user every request used before W6.
const legacyDevEmail = "dev@localhost";

export class RegisterError extends Error {}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Returns a message to show the user, or null when the input is fine.
export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) {
    return "Enter a valid email address.";
  }
  if (password.length < minPasswordLength) {
    return `Password must be at least ${minPasswordLength} characters.`;
  }
  return null;
}

export async function registerUser(email: string, password: string): Promise<{ id: string }> {
  const problem = validateCredentials(email, password);
  if (problem) throw new RegisterError(problem);

  const passwordHash = await bcrypt.hash(password, bcryptRounds);
  // The unique index on email decides: if the row already exists nothing is
  // inserted (safe even when two sign-ups race).
  const [created] = await db
    .insert(users)
    .values({ email: normalizeEmail(email), passwordHash })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (!created) throw new RegisterError("An account with this email already exists.");
  return created;
}

// Returns the user when email + password match, otherwise null. The same
// null for "unknown email" and "wrong password", so the login form cannot be
// used to find out which emails have accounts.
export async function verifyUser(
  email: string,
  password: string,
): Promise<{ id: string; email: string } | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)));
  if (!user) return null;
  // compare() returns false for a value that is not a bcrypt hash (like "!").
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? { id: user.id, email: user.email } : null;
}

// Creates the default account from DEFAULT_USER_EMAIL / DEFAULT_USER_PASSWORD
// (or resets its password). If the old dev@localhost user still exists, it is
// turned into the default user instead, so its documents keep their owner.
// Safe to run any number of times.
export async function ensureDefaultUser(): Promise<{ id: string; email: string }> {
  const email = normalizeEmail(process.env.DEFAULT_USER_EMAIL ?? "");
  const password = process.env.DEFAULT_USER_PASSWORD ?? "";
  const problem = validateCredentials(email, password);
  if (problem) {
    throw new Error(`DEFAULT_USER_EMAIL / DEFAULT_USER_PASSWORD in .env: ${problem}`);
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    if (!(await bcrypt.compare(password, existing.passwordHash))) {
      const passwordHash = await bcrypt.hash(password, bcryptRounds);
      await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id));
    }
    return { id: existing.id, email };
  }

  const passwordHash = await bcrypt.hash(password, bcryptRounds);
  const [converted] = await db
    .update(users)
    .set({ email, passwordHash })
    .where(eq(users.email, legacyDevEmail))
    .returning({ id: users.id });
  if (converted) return { id: converted.id, email };

  const [created] = await db
    .insert(users)
    .values({ email, passwordHash })
    .returning({ id: users.id });
  return { id: created.id, email };
}

// Terminal scripts (ingest, ask, eval) have no login session; they act as
// the default user from .env.
export async function getScriptUserId(): Promise<string> {
  return (await ensureDefaultUser()).id;
}
