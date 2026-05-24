import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 * Use this in Client Components ("use client").
 *
 * Reads from NEXT_PUBLIC_* env vars (safe to expose).
 * Server-side code must use lib/supabase/server.ts instead.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
