import type { NextConfig } from "next";

// Keep the local preview alive while a production build runs its release checks.
const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next"
};
export default nextConfig;
