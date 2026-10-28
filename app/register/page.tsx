import type { Metadata } from "next";
import { AuthForm } from "@/src/components/auth-form";

export const metadata: Metadata = { title: "Create account · Chat with PDF" };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
