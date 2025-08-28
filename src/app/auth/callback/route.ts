import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  console.log("🔍 OAuth Callback Debug:");
  console.log("URL:", request.url);
  console.log("Code:", code);
  console.log("Error:", error);
  console.log("Error Description:", errorDescription);

  if (error) {
    console.error("❌ OAuth Error:", error, errorDescription);
    return NextResponse.redirect(
      new URL(
        `/auth/v2/login?error=${encodeURIComponent(error)}&description=${encodeURIComponent(errorDescription || "")}`,
        requestUrl.origin,
      ),
    );
  }

  if (!code) {
    console.error("❌ No OAuth code received");
    return NextResponse.redirect(new URL("/auth/v2/login?error=no_code", requestUrl.origin));
  }

  try {
    console.log("🔄 Exchanging code for session...");
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch (error) {
              console.error("Error setting cookies:", error);
            }
          },
        },
      },
    );

    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("❌ Session exchange error:", exchangeError);
      return NextResponse.redirect(
        new URL(
          `/auth/v2/login?error=exchange_failed&description=${encodeURIComponent(exchangeError.message)}`,
          requestUrl.origin,
        ),
      );
    }

    if (data.session) {
      console.log("✅ OAuth successful, session created");
      console.log("User:", data.user?.email);
      return NextResponse.redirect(new URL("/dashboard/default", requestUrl.origin));
    } else {
      console.error("❌ No session after exchange");
      return NextResponse.redirect(new URL("/auth/v2/login?error=no_session", requestUrl.origin));
    }
  } catch (error) {
    console.error("❌ Unexpected error in callback:", error);
    return NextResponse.redirect(new URL("/auth/v2/login?error=unexpected_error", requestUrl.origin));
  }
}
