import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

/**
 * Match all routes except:
 * - _next static files
 * - _next image optimization
 * - favicon, manifest, icons, and other static assets
 * - service worker files
 *
 * Adjust this list when adding new public asset patterns.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-.*|apple-touch-icon.*|sw.js|workbox-.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
