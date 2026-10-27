"use client";

import { useEffect } from "react";
import Link from "next/link";

/** 路由層級的錯誤邊界：任何未預期的錯誤都會顯示可讀訊息，不會白屏。 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("頁面發生錯誤：", error);
  }, [error]);

  return (
    <div className="card border-rose-200 bg-rose-50" role="alert">
      <h1 className="text-lg font-semibold text-rose-900">頁面發生錯誤</h1>
      <p className="mt-1 text-sm text-rose-800">
        畫面無法完成渲染。你可以重試，或回到輸入頁重新提交行程。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={reset}>
          重試
        </button>
        <Link className="btn-secondary inline-flex items-center" href="/">
          返回輸入頁
        </Link>
      </div>
    </div>
  );
}
