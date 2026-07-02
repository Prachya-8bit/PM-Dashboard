import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SQLite database file is read server-side only — never bundled
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
