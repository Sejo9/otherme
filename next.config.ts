import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  experimental: {
    // Every page here is dynamic (it reads cookies), and Next's default is to
    // discard dynamic pages from the client router cache after 0 seconds —
    // so switching tabs re-fetched everything from the server every time.
    // Holding them briefly makes moving between tabs instant, which is what a
    // bottom tab bar has to feel like. Realtime subscriptions keep the
    // contents fresh regardless of this cache.
    staleTimes: { dynamic: 120, static: 300 },
  },
  async headers() {
    return [
      {
        // The service worker must be allowed to control the whole origin.
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
