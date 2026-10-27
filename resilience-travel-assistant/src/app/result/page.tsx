"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DecisionView } from "@/components/DecisionView";
import { LoadingCard } from "@/components/states";
import { tripRequestFromSearchParams } from "@/lib/url-params";

/**
 * 結果頁（成員 D 的模組）。
 *
 * 原本是伺服器元件，靠 `searchParams` 取得行程參數；改為客戶端讀取後，
 * 同一份程式碼在兩種模式下都能運作：
 *  - 一般 Next.js 伺服器模式：頁面先渲染殼層，參數於瀏覽器端解析
 *  - 靜態匯出（GitHub Pages）：沒有伺服器，參數只能在前端解析
 *
 * 行程參數全部編在 URL 上，因此結果仍然可重現、可分享。
 */
function ResultContent() {
  const searchParams = useSearchParams();
  const { request, issues } = tripRequestFromSearchParams(
    new URLSearchParams(searchParams.toString()),
  );

  return <DecisionView request={request} paramIssues={issues} />;
}

export default function ResultPage() {
  return (
    <Suspense fallback={<LoadingCard label="正在載入出行建議" />}>
      <ResultContent />
    </Suspense>
  );
}
