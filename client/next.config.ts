import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@prd-studio/contracts"],
  turbopack: {
    root: path.resolve(import.meta.dirname, "..")
  }
};

export default nextConfig;
