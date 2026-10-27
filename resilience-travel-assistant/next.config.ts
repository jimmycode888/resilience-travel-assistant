import type { NextConfig } from "next";

/**
 * 兩套建置模式：
 *  - 預設（`npm run build`）：一般 Next.js 伺服器模式，含 /api/decision 路由。
 *  - 靜態（`npm run build:static`）：輸出純靜態檔到 `out/`，供 GitHub Pages 使用。
 *    決策引擎改在前端直接執行，因此不需要伺服器端 API。
 *
 * basePath 只在靜態模式啟用，因為 GitHub Pages 的專案站台會掛在
 * `/<repo-name>/` 底下；可用 BASE_PATH="" 覆寫（例如根路徑託管）。
 */
const isStatic = process.env.STATIC_EXPORT === "1";
const basePath = isStatic ? (process.env.BASE_PATH ?? "/resilience-travel-assistant") : "";

const appVersion = process.env.APP_VERSION ?? "0.1.0";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ESLint 在 `npm run lint` 與 `npm run verify` 中單獨執行；建置時一併檢查，
  // 讓「主分支必須可建置」同時意味著「主分支必須通過 lint」。
  eslint: { ignoreDuringBuilds: false },
  env: {
    APP_VERSION: appVersion,
    // 靜態模式把決策引擎搬到瀏覽器端執行；一般模式維持呼叫 /api/decision。
    NEXT_PUBLIC_LOCAL_ENGINE: isStatic ? "1" : "",
  },
  ...(isStatic
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
        basePath,
        assetPrefix: basePath || undefined,
      }
    : {}),
};

export default nextConfig;
