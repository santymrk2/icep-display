import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["minio", "postgres"],
  // El reproductor es HTML/JS plano (ES5) para que corra en TVs viejos. Ver public/player.html.
  async rewrites() {
    return [{ source: "/player", destination: "/player.html" }];
  },
  async headers() {
    return [
      { source: "/player", headers: [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate" }] },
      { source: "/player.html", headers: [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
