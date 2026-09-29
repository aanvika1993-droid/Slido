import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a lockfile in a parent directory isn't picked up.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
