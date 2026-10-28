import { LogOut } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { auth } from "@/src/lib/auth";
import { logoutAction } from "@/src/lib/auth-actions";

// Shows who is logged in + a logout button. It reads the session cookie,
// so with Cache Components it must be rendered inside <Suspense>.
export async function UserMenu() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <form action={logoutAction} className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="min-w-0 flex-1 truncate" title={session.user.email ?? undefined}>
        {session.user.email}
      </span>
      <Button type="submit" variant="ghost" size="xs">
        <LogOut /> Log out
      </Button>
    </form>
  );
}
