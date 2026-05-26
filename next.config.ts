import withPWAInit from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

const baseConfig: NextConfig = {
  // Pin the workspace root so Turbopack (dev) does not climb to the parent
  // package-lock.json. Production build uses webpack so next-pwa hooks work.
  turbopack: {
    root: __dirname,
  },
  // @react-pdf/renderer ships hybrid ESM/CJS that confuses Next's bundler
  // unless we transpile it explicitly. Otherwise pdf() and PDFViewer
  // throw "Cannot read properties of undefined" at runtime.
  transpilePackages: ["@react-pdf/renderer"],
};

const withPWA = withPWAInit({
  dest: "public",
  // Disable SW in dev to avoid caching headaches during local iteration.
  disable: isDev,
  register: true,
  // Skip waiting on new SW versions — users get fresh code on reload.
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
  },
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
});

export default withPWA(baseConfig);
