"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { type AuthFormState, loginAction, registerAction } from "@/src/lib/auth-actions";

// One form for both pages; the server action does the real validation.
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isLogin = mode === "login";
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    isLogin ? loginAction : registerAction,
    undefined,
  );

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">{isLogin ? "Log in" : "Create an account"}</CardTitle>
          <CardDescription>
            Chat with PDF — your documents are visible only to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Email
              <Input name="email" type="email" autoComplete="email" required />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Password
              <Input
                name="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                minLength={isLogin ? undefined : 8}
                required
              />
            </label>
            {!isLogin && (
              <label className="flex flex-col gap-1 text-sm">
                Confirm password
                <Input name="confirm" type="password" autoComplete="new-password" required />
              </label>
            )}

            {state?.error && (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            )}

            <Button type="submit" disabled={pending}>
              {pending ? "Please wait…" : isLogin ? "Log in" : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isLogin ? "No account yet? " : "Already have an account? "}
            <Link href={isLogin ? "/register" : "/login"} className="underline underline-offset-4">
              {isLogin ? "Create one" : "Log in"}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
