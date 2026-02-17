import type { NextConfig } from "next";

const backendOrigin = process.env.BACKEND_ORIGIN ?? (process.env.NODE_ENV === "development" ? "http://localhost:4001" : undefined);

const nextConfig: NextConfig = {
  async rewrites() {
    if (!backendOrigin) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
