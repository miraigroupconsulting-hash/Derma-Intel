import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh the Supabase session on every request.
 * Called from the root middleware.ts.
 *
 * This ensures the auth cookie is renewed and that protected routes
 * see an up-to-date user. Also enforces the auth gate: unauthenticated
 * visits to /dashboard (and similar) get redirected to /login.
 *
 * Public routes (landing, login, signup, manifest, icons, _next) are
 * left alone.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
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

  // Auth gate: protected routes require a session.
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/pacientes") ||
    pathname.startsWith("/consulta") ||
    pathname.startsWith("/biblioteca");

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If a logged-in user hits /login or /signup, bounce to dashboard.
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  if (isAuthPage && user) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashUrl);
  }

  return supabaseResponse;
}
