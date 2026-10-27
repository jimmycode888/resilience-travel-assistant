import { isApiErrorBody, type ApiErrorBody } from "./api/errors";
import type { DecisionResponse } from "./types";

export class DecisionApiError extends Error {
  readonly code: string;
  readonly details: string[];
  readonly httpStatus: number | null;

  constructor(message: string, options: { code: string; details?: string[]; httpStatus?: number | null }) {
    super(message);
    this.name = "DecisionApiError";
    this.code = options.code;
    this.details = options.details ?? [];
    this.httpStatus = options.httpStatus ?? null;
  }
}

export interface RequestDecisionOptions {
  signal?: AbortSignal;
  /** 演示用的故障注入；只有伺服器開啟 ALLOW_FAULT_INJECTION=1 時才生效。 */
  faultInjection?: "internal_error" | "delay";
}

/**
 * 靜態建置（GitHub Pages 等純靜態託管）時為 `"1"`。
 * 此時沒有伺服器端 API，決策引擎直接在瀏覽器端執行；
 * 一般伺服器模式維持呼叫 /api/decision，行為完全不變。
 */
const USE_LOCAL_ENGINE = process.env.NEXT_PUBLIC_LOCAL_ENGINE === "1";

/**
 * 呼叫 POST /api/decision。
 * 任何失敗都會轉成 DecisionApiError，讓 UI 只需要處理一種錯誤型別。
 */
export async function requestDecision(
  payload: object,
  options: RequestDecisionOptions = {},
): Promise<DecisionResponse> {
  const body = options.faultInjection ? { ...payload, faultInjection: options.faultInjection } : payload;

  if (USE_LOCAL_ENGINE) {
    return requestDecisionLocal(body, options);
  }

  let response: Response;
  try {
    response = await fetch("/api/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new DecisionApiError("無法連線到決策服務，請確認網路連線後重試。", {
      code: "NETWORK_ERROR",
      details: [error instanceof Error ? error.message : String(error)],
    });
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new DecisionApiError("決策服務回應了無法解析的內容。", {
      code: "BAD_RESPONSE",
      httpStatus: response.status,
    });
  }

  if (!response.ok) {
    if (isApiErrorBody(parsed)) {
      const body: ApiErrorBody = parsed;
      throw new DecisionApiError(body.error.message, {
        code: body.error.code,
        details: body.error.details,
        httpStatus: response.status,
      });
    }
    throw new DecisionApiError(`決策服務回應 HTTP ${response.status}。`, {
      code: "HTTP_ERROR",
      httpStatus: response.status,
    });
  }

  if (!isDecisionResponse(parsed)) {
    throw new DecisionApiError("決策服務回傳的格式與契約不符，請通知成員 A 檢查。", {
      code: "CONTRACT_MISMATCH",
      httpStatus: response.status,
    });
  }

  return parsed;
}

/**
 * 靜態模式：直接呼叫與 /api/decision 共用的處理函式。
 * 走的是同一套驗證、三層回退鏈與決策邏輯，差別只在於不經過 HTTP。
 */
async function requestDecisionLocal(
  payload: object,
  options: RequestDecisionOptions,
): Promise<DecisionResponse> {
  if (options.signal?.aborted) {
    throw new DOMException("已取消請求。", "AbortError");
  }

  const { handleDecisionRequest } = await import("./api/decision-handler");
  const result = await handleDecisionRequest(payload, { allowFaultInjection: false });

  if (!isDecisionResponse(result.body)) {
    const body = result.body as ApiErrorBody;
    throw new DecisionApiError(body.error.message, {
      code: body.error.code,
      details: body.error.details,
      httpStatus: result.status,
    });
  }

  return result.body;
}

/** 輕量結構檢查：只驗證契約鎖定的欄位，用來及早發現格式漂移。 */
export function isDecisionResponse(value: unknown): value is DecisionResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DecisionResponse>;
  return (
    (candidate.status === "ready" ||
      candidate.status === "uncertain" ||
      candidate.status === "unavailable") &&
    typeof candidate.departAt === "string" &&
    Array.isArray(candidate.etaRange) &&
    candidate.etaRange.length === 2 &&
    (candidate.confidence === "high" ||
      candidate.confidence === "medium" ||
      candidate.confidence === "low") &&
    Array.isArray(candidate.primaryRoute) &&
    Array.isArray(candidate.planB) &&
    typeof candidate.switchCondition === "string" &&
    Array.isArray(candidate.reasons) &&
    typeof candidate.dataUpdatedAt === "string" &&
    (candidate.dataQuality === "live" ||
      candidate.dataQuality === "cached" ||
      candidate.dataQuality === "fixture")
  );
}
