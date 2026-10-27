import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ESLint 在 `npm run lint` 與 `npm run verify` 中單獨執行；建置時一併檢查，
  // 讓「主分支必須可建置」同時意味著「主分支必須通過 lint」。
  eslint: { ignoreDuringBuilds: false },
  env: {
    APP_VERSION: process.env.APP_VERSION ?? "0.1.0",
  },
};

export default nextConfig;
