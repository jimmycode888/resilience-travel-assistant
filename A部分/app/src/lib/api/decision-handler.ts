/**
 * POST /api/decision 的處理邏輯（與 Next.js 解耦，方便單元測試）。
 *
 * 流程：輸入驗證 → 取得情境快照（live → cached → fixture）→ 執行決策 → 回傳結構化結果。
 */
import { decideTrip } from "@/lib/decision";
import { toHkIso } from "@/lib/time";
import type { ContextResolution, DecisionResponse, Scenario } from "@/lib/types";
import {
  readFaultInjection,
  stripDebugFields,
  validateTripRequest,
  type FaultInjection,
} from "@/lib/validation";
import { apiError, type ApiErrorBody } from "./errors";

export interface DecisionHandlerDeps {
  /** 是否允許 demo 用的故障注入。預設讀取 ALLOW_FAULT_INJECTION。 */
  allowFaultInjection?: boolean;
  /** 解析情景快照。預設使用 lib/adapters 的三層回退鏈。 */
  resolveContext?: (options: { scenario: Scenario }) => Promise<ContextResolution>;
  /** 測試用的延遲實作。 */
  sleep?: (ms: number) => Promise<void>;
  /**
   * 注入「現在時間」（回傳 epoch 毫秒）。
   * 決策層唯一的時間來源；預設為 Date.now，測試可固定它。
   */
  now?: () => number;
}

export interface HandlerResult {
  status: number;
  body: DecisionResponse | ApiErrorBody;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export async function handleDecisionRequest(
  rawInput: unknown,
  deps: DecisionHandlerDeps = {},
): Promise<HandlerResult> {
  const allowFaultInjection =
    deps.allowFaultInjection ?? process.env.ALLOW_FAULT_INJECTION === "1";
  const fault = allowFaultInjection ? readFaultInjection(rawInput) : null;

  const validation = validateTripRequest(stripDebugFields(rawInput));
  if (!validation.ok) {
    return {
      status: 400,
      body: apiError("INVALID_INPUT", validation.message, validation.details),
    };
  }

  const { request } = { request: validation.value };

  if (fault) {
    const faultResult = await applyFault(fault, deps.sleep ?? defaultSleep);
    if (faultResult) return faultResult;
  }

  try {
    const resolveContext = deps.resolveContext ?? (await import("@/lib/adapters")).resolveContext;
    const now = deps.now ?? (() => Date.now());
    const resolution = await resolveContext({ scenario: request.scenario });
    const body = decideTrip(request, resolution.snapshot, {
      notices: resolution.notices,
      now: toHkIso(now()),
    });
    // unavailable 是合法的決策結果（不是 HTTP 錯誤），因此仍回傳 200。
    return { status: 200, body };
  } catch (error) {
    return {
      status: 500,
      body: apiError("INTERNAL_ERROR", "決策服務暫時無法完成計算。", [
        error instanceof Error ? error.message : String(error),
      ]),
    };
  }
}

async function applyFault(
  fault: FaultInjection,
  sleep: (ms: number) => Promise<void>,
): Promise<HandlerResult | null> {
  switch (fault) {
    case "internal_error":
      return {
        status: 500,
        body: apiError("INTERNAL_ERROR", "（故障注入）模擬後端計算失敗。", [
          'faultInjection: "internal_error"',
        ]),
      };
    case "delay":
      await sleep(2500);
      return null;
    default:
      return null;
  }
}
