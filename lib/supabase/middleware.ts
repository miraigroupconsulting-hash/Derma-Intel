import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

/**
 * Refresh the Supabase session on every request and enforce gates:
 *
 *   1. Auth gate: unauthenticated visits to protected routes go to /login.
 *   2. Onboarding gate: authenticated médicos without onboarding_completed
 *      get redirected to /onboarding (except when already on it).
 *   3. Authenticated users hitting /login or /signup bounce to /dashboard.
 *
 * Public routes (/, manifest, icons, _next) are left alone.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session if expired — important to keep RSCs happy.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/pacientes") ||
    pathname.startsWith("/consulta") ||
    pathname.startsWith("/biblioteca") ||
    pathname.startsWith("/onboarding");

  const isAuthPage = pathname === "/login" || pathname === "/signup";

  // Auth gate: protected routes require a session.
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If a logged-in user hits /login or /signup, bounce to dashboard.
  if (isAuthPage && user) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashUrl);
  }

  // Onboarding gate: any authenticated route except /onboarding itself
  // requires the médico to have completed onboarding.
  const isOnboardingPage = pathname.startsWith("/onboarding");
  if (user && isProtected && !isOnboardingPage) {
    const { data: medico } = await supabase
      .from("medicos")
      .select("onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();

    if (!medico?.onboarding_completed) {
      const onboardingUrl = request.nextUrl.clone();
      onboardingUrl.pathname = "/onboarding";
      return NextResponse.redirect(onboardingUrl);
    }
  }

  return supabaseResponse;
}
