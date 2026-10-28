import { Suspense } from "react";
import { ChatApp } from "@/src/components/chat-app";
import { UserMenu } from "@/src/components/user-menu";

export default function Home() {
  return (
    <ChatApp
      userMenu={
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      }
    />
  );
}
