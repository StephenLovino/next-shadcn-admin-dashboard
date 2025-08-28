import { NextRequest, NextResponse } from "next/server";

export async function authMiddleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  console.log("🔍 Middleware Debug:");
  console.log("Path:", pathname);

  // For dashboard routes, be very permissive
  // Let the client-side auth handle session validation
  if (pathname.startsWith("/dashboard")) {
    console.log("✅ Allowing dashboard access - client-side auth will handle validation");
    return NextResponse.next();
  }

  // For auth routes, redirect to dashboard if user might be signed in
  if (pathname === "/auth/v2/login" || pathname === "/auth/v2/register") {
    // Check if there are any cookies that might indicate a session
    const allCookies = req.cookies.getAll();
    const hasAnyCookies = allCookies.length > 0;

    console.log("Auth route - has any cookies:", hasAnyCookies);
    console.log(
      "Cookie names:",
      allCookies.map((c) => c.name),
    );

    // If there are any cookies, user might be signed in, let client-side handle it
    if (hasAnyCookies) {
      console.log("✅ Allowing auth route access - client-side auth will handle redirect");
      return NextResponse.next();
    }

    // Only redirect to login if absolutely no cookies exist
    console.log("❌ No cookies found, staying on auth page");
    return NextResponse.next();
  }

  // Allow all other routes
  return NextResponse.next();
}
