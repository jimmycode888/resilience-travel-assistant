"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buildResultPath } from "@/lib/url-params";
import type { Scenario, TripRequest } from "@/lib/types";
import { DecisionCard } from "./DecisionCard";
import { ScenarioSwitcher } from "./ScenarioSwitcher";
import { ErrorNotice, LoadingCard, SectionCard } from "./states";
import { useDecision } from "./use-decision";

/**
 * 結果頁容器（成員 D 的模組）。
 *
 * 狀態齊全：loading / success / unavailable / error / 無效輸入，任何情況都不會白屏。
 */
export function DecisionView({
  request,
  paramIssues = [],
}: {
  request: TripRequest;
  paramIssues?: readonly string[];
}) {
  const router = useRouter();
  const { state, reload } = useDecision(request);
  const [showRaw, setShowRaw] = useState(false);

  function handleScenarioChange(scenario: Scenario) {
    router.replace(buildResultPath({ ...request, scenario }), { scroll: false });
  }

  return (
    <div className="space-y-4">
      {paramIssues.length > 0 ? (
        <ErrorNotice
          title="網址參數有問題"
          message="以下參數無法辨識，已改用示範預設值："
          details={[...paramIssues]}
          code="INVALID_URL_PARAMS"
        />
      ) : null}

      {state.phase === "loading" ? <LoadingCard label="正在計算出行建議" /> : null}

      {state.phase === "error" ? (
        <ErrorNotice
          message={state.message}
          details={state.details}
          code={state.code}
          onRetry={reload}
        />
      ) : null}

      {state.phase === "success" ? <DecisionCard decision={state.data} /> : null}

      <SectionCard
        title="演示情景"
        hint="切換情景會更新網址，因此重新整理後結果保持一致"
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={reload} disabled={state.phase === "loading"}>
              重新查詢
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowRaw((value) => !value)}
              aria-expanded={showRaw}
            >
              {showRaw ? "隱藏原始 JSON" : "查看原始 JSON"}
            </button>
          </div>
        }
      >
        <ScenarioSwitcher
          value={request.scenario}
          onChange={handleScenarioChange}
          disabled={state.phase === "loading"}
        />
      </SectionCard>

      <div>
      {showRaw && state.phase === "success" ? (
        <SectionCard title="原始 JSON（除錯用）" hint="POST /api/decision 的完整回應">
          <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
            {JSON.stringify(state.data, null, 2)}
          </pre>
        </SectionCard>
      ) : null}
      </div>
    </div>
  );
}
