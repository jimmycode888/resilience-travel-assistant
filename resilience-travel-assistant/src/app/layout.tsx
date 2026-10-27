import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { CORRIDOR } from "@/lib/corridor";

export const metadata: Metadata = {
  title: "韌性出行助手｜將軍澳（坑口）→ 中環",
  description:
    "把天氣與交通資訊轉成「幾點走、走哪條、什麼時候切換」的行動建議。演示原型，使用固定示範資料。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

/**
 * 靜態匯出（GitHub Pages）時沒有伺服器端 API，頁尾改為說明文字，
 * 避免出現指向不存在路由的連結。
 */
const LOCAL_ENGINE = process.env.NEXT_PUBLIC_LOCAL_ENGINE === "1";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body className="antialiased">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
          <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
            <Link href="/" className="inline-flex min-h-11 items-center text-lg font-semibold tracking-tight text-slate-900">
              韌性出行助手
            </Link>
            <span className="text-xs text-slate-500">{CORRIDOR.name}</span>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="mt-10 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
            <p>
              演示原型 · 固定通勤走廊 · 不含登入、支付、推送或全港路線搜尋。到達信心為定性判斷，
              並非經校準的準時機率。
            </p>
            <p className="mt-1">
              {LOCAL_ENGINE ? (
                <>靜態版本：決策引擎在瀏覽器端執行，無伺服器端 API。</>
              ) : (
                <>
                  <a className="inline-flex min-h-11 items-center underline hover:text-slate-700" href="/api/health">
                    /api/health
                  </a>
                  {" · "}
                  <a className="inline-flex min-h-11 items-center underline hover:text-slate-700" href="/api/decision">
                    /api/decision
                  </a>
                </>
              )}
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
