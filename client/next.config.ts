import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const projectDir = path.resolve(import.meta.dirname, "..");
loadEnvConfig(projectDir);

const nextConfig: NextConfig = {
  transpilePackages: ["@prd-studio/contracts"],
  turbopack: {
    root: projectDir
  },
  async rewrites() {
    const backendUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001").replace(/\/$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`
      }
    ];
  }
};

export default nextConfig;

