"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DecisionApiError, requestDecision } from "@/lib/api-client";
import type { DecisionResponse, TripRequest } from "@/lib/types";

export type DecisionState =
  | { phase: "loading" }
  | { phase: "success"; data: DecisionResponse }
  | { phase: "error"; message: string; details: string[]; code: string };

/**
 * 呼叫決策 API。
 *
 * 依賴鍵是請求的 JSON 字串，因此：
 * - 相同的請求只會發出一次查詢（元件重新渲染不會重複提交）。
 * - 請求改變（例如切換情景）才重新查詢。
 * - 重新整理頁面會用 URL 內的相同請求重新查詢，結果完全一致。
 */
export function useDecision(request: TripRequest): {
  state: DecisionState;
  reload: () => void;
} {
  const requestKey = useMemo(() => JSON.stringify(request), [request]);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<DecisionState>({ phase: "loading" });

  useEffect(() => {
    const payload = JSON.parse(requestKey) as TripRequest;
    const controller = new AbortController();
    let cancelled = false;

    setState({ phase: "loading" });

    requestDecision(payload, { signal: controller.signal })
      .then((data) => {
        if (!cancelled) setState({ phase: "success", data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof DecisionApiError) {
          setState({
            phase: "error",
            message: error.message,
            details: error.details,
            code: error.code,
          });
          return;
        }
        setState({
          phase: "error",
          message: "發生未預期的錯誤。",
          details: [error instanceof Error ? error.message : String(error)],
          code: "UNKNOWN",
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [requestKey, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { state, reload };
}
