import { auth } from "./auth";

// Thrown when a request has no valid session; API routes turn it into 401.
export class UnauthorizedError extends Error {
  constructor() {
    super("Please log in.");
  }
}

// The logged-in user's id, read from the Auth.js session cookie. Every API
// route gets its user here and scopes all queries by it (core rule 5).
// proxy.ts already turns away most logged-out requests; this is the real check.
export async function getCurrentUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new UnauthorizedError();
  return id;
}
