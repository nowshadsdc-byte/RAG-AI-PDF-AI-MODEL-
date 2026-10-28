import type { Metadata } from "next";
import { AuthForm } from "@/src/components/auth-form";

export const metadata: Metadata = { title: "Log in · Chat with PDF" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
