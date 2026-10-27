/**
 * 靜態建置（GitHub Pages 用）。
 *
 * `next build` 在 output:"export" 模式下不支援 POST 路由處理器，因此建置前
 * 先把 `src/app/api/` 暫時移開，建置完成（不論成敗）再還原。
 * 這樣主分支的原始碼維持完整，`npm run build` 的一般伺服器模式也不受影響。
 */
import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(appDir);

const apiDir = path.join(appDir, "src", "app", "api");
const parkedDir = path.join(appDir, "src", "app", "_api_parked");

if (existsSync(parkedDir)) {
  console.error(`[build-static] 發現上次殘留的 ${parkedDir}，請先手動確認後刪除。`);
  process.exit(1);
}

const moved = existsSync(apiDir);
if (moved) {
  renameSync(apiDir, parkedDir);
  console.log("[build-static] 已暫時移開 src/app/api");
}

let status = 1;
try {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  // Turbopack：webpack 版本的建置在本機會在寫入 .next/trace 時報 EPERM，
  // Turbopack 管線不寫該檔，且建置更快。
  const result = spawnSync(npx, ["next", "build", "--turbopack"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      STATIC_EXPORT: "1",
      BASE_PATH: process.env.BASE_PATH ?? "/resilience-travel-assistant",
    },
  });
  status = result.status ?? 1;
} finally {
  if (moved && existsSync(parkedDir)) {
    renameSync(parkedDir, apiDir);
    console.log("[build-static] 已還原 src/app/api");
  }
}

process.exit(status);
