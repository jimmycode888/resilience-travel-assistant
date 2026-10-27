"use client";

import { useEffect } from "react";

/** 最外層錯誤邊界（連 layout 都失敗時使用），必須自行渲染 html / body。 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("全域錯誤：", error);
  }, [error]);

  return (
    <html lang="zh-HK">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "24px", background: "#f8fafc" }}>
        <h1 style={{ fontSize: "18px", fontWeight: 600 }}>韌性出行助手暫時無法載入</h1>
        <p style={{ marginTop: "8px", fontSize: "14px", color: "#334155" }}>
          服務發生未預期的錯誤。請重新載入，或改用離線演示版本。
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "16px",
            padding: "10px 16px",
            borderRadius: "12px",
            border: "1px solid #cbd5e1",
            background: "white",
            cursor: "pointer",
          }}
        >
          重新載入
        </button>
      </body>
    </html>
  );
}
