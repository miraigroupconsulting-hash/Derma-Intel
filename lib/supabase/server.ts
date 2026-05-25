import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Server-side Supabase client.
 * Use this in Server Components, Server Actions, and Route Handlers.
 *
 * Reads cookies via next/headers so the user session is honored.
 * The cookies API is async in Next 15, so this function is async too.
 *
 * For destructive admin operations (bypassing RLS), build a separate
 * client with SUPABASE_SERVICE_ROLE_KEY in the specific route handler
 * that needs it. Never expose the service role key to anything
 * reachable by the client.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
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
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be safely ignored if you have middleware
            // refreshing user sessions (we do — see middleware.ts).
          }
        },
      },
    },
  );
}
