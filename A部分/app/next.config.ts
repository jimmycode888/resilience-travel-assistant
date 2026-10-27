import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['eviltransform'],
  outputFileTracingIncludes: { '/api/journey': ['./data/transit/hk-network.json.gz'], '/api/transit-status': ['./data/transit/hk-network.json.gz'] },
  reactStrictMode: true,
  // Separate current output from another session's unwritable legacy cache.
  distDir: process.env.NEXT_DIST_DIR ?? ".next-b",
  // ESLint 在 `npm run lint` 與 `npm run verify` 中單獨執行；建置時一併檢查，
  // 讓「主分支必須可建置」同時意味著「主分支必須通過 lint」。
  eslint: { ignoreDuringBuilds: false },
  env: {
    APP_VERSION: process.env.APP_VERSION ?? "0.1.0",
  },
};

export default nextConfig;
