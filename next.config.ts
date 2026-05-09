import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "screen-wake-lock=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
