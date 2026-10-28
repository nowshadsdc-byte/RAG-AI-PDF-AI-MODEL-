import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";

// Next.js 16 "proxy" (formerly middleware): runs before every matched request.
// Logged-out visitors are sent to /login, and API calls get 401. This is
// only a first, cheap check — each API route still verifies the session
// itself via getCurrentUserId().
const publicPages = ["/login", "/register"];

export const proxy = auth((request) => {
  const { pathname } = request.nextUrl;
  const loggedIn = Boolean(request.auth?.user?.id);
  const isPublicPage = publicPages.includes(pathname);

  if (pathname.startsWith("/api/auth")) return NextResponse.next(); // Auth.js itself

  if (!loggedIn && pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Please log in." }, { status: 401 });
  }
  if (!loggedIn && !isPublicPage) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }
  if (loggedIn && isPublicPage) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  // Everything except Next's own assets and files with an extension (icons etc.).
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
