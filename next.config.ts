import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Overridable build dir. On Windows, two Next processes sharing `.next` fight over
   * `.next/trace` and the second dies with EPERM — which is exactly what happens when
   * the browser smoke test starts a server while a dev server is already open in an
   * editor. `NEXT_DIST_DIR=.next-smoke` keeps them out of each other's way.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  experimental: {
    // Audio uploads for /api/transcribe stay small (we cap client-side at ~60s).
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
