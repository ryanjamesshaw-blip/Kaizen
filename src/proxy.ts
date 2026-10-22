import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: redirect unauthenticated visitors to /login.
// Real authorisation happens in every page and server action.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("kaizen_session");
  const isLogin = request.nextUrl.pathname.startsWith("/login");
  if (!hasSession && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
