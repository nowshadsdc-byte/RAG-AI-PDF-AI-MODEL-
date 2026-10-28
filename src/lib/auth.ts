import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyUser } from "./users";

// Auth.js with email + password (credentials provider).
// Sessions are JWTs in an http-only cookie signed with AUTH_SECRET, so no
// sessions table is needed. The token carries only the user id; every query
// is then scoped by that id (core rule 5).
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      // Returning null makes Auth.js reject the login (CredentialsSignin).
      authorize: async (credentials) => {
        const { email, password } = credentials;
        if (typeof email !== "string" || typeof password !== "string") return null;
        return verifyUser(email, password);
      },
    }),
  ],
  callbacks: {
    // On login `user` is what authorize() returned; keep its id in the token.
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      return session;
    },
  },
});
