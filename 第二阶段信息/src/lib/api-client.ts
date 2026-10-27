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
 * 呼叫 POST /api/decision。
 * 任何失敗都會轉成 DecisionApiError，讓 UI 只需要處理一種錯誤型別。
 */
export async function requestDecision(
  payload: object,
  options: RequestDecisionOptions = {},
): Promise<DecisionResponse> {
  const body = options.faultInjection ? { ...payload, faultInjection: options.faultInjection } : payload;

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
