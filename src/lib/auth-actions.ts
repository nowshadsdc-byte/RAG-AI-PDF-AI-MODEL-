"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "./auth";
import { registerUser, RegisterError, validateCredentials } from "./users";

// Server actions used by the login / register forms (useActionState).
// On success signIn() redirects to "/" by throwing Next's redirect signal,
// so only AuthError is caught here — everything else must be re-thrown.

export type AuthFormState = { error: string } | undefined;

function readForm(formData: FormData) {
  return {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
}

async function logIn(email: string, password: string): Promise<AuthFormState> {
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    // Same message for unknown email and wrong password (see verifyUser).
    if (error instanceof AuthError) return { error: "Wrong email or password." };
    throw error;
  }
}

export async function loginAction(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password } = readForm(formData);
  if (!email || !password) return { error: "Enter your email and password." };
  return logIn(email, password);
}

export async function registerAction(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password } = readForm(formData);
  if (password !== String(formData.get("confirm") ?? "")) {
    return { error: "The two passwords do not match." };
  }
  const problem = validateCredentials(email, password);
  if (problem) return { error: problem };

  try {
    await registerUser(email, password);
  } catch (error) {
    if (error instanceof RegisterError) return { error: error.message };
    throw error;
  }
  // Log the new user straight in.
  return logIn(email, password);
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
