/**
 * TripRequest 的執行期輸入驗證（成員 A 維護）。
 *
 * 兩層驗證：
 * 1. 結構（zod，strict）：型別、範圍、未知欄位。
 * 2. 語意：arriveBy 是否為真實存在的香港時間、origin / destination 是否為走廊內的預設地點。
 *
 * 所有錯誤都會轉成可讀的中文訊息，回傳穩定的錯誤結構（見 API_CONTRACT.md）。
 */
import { z } from "zod";
import { DESTINATIONS, ORIGINS, findPlace } from "@/lib/corridor";
import { parseArriveBy } from "@/lib/time";
import { SCENARIOS, type TripRequest } from "@/lib/types";

export const MAX_EXTRA_COST_HKD = 500;
export const MAX_ALLOWED_TRANSFERS = 5;

const tripRequestSchema = z
  .object({
    origin: z.string().trim().min(1, "origin 不可為空。"),
    destination: z.string().trim().min(1, "destination 不可為空。"),
    arriveBy: z.string().trim().min(1, "arriveBy 不可為空。"),
    constraints: z
      .object({
        maxExtraCost: z
          .number({ invalid_type_error: "constraints.maxExtraCost 必須是數字。" })
          .int("constraints.maxExtraCost 必須是整數。")
          .min(0, "constraints.maxExtraCost 不可小於 0。")
          .max(MAX_EXTRA_COST_HKD, `constraints.maxExtraCost 不可大於 ${MAX_EXTRA_COST_HKD}。`),
        maxTransfers: z
          .number({ invalid_type_error: "constraints.maxTransfers 必須是數字。" })
          .int("constraints.maxTransfers 必須是整數。")
          .min(0, "constraints.maxTransfers 不可小於 0。")
          .max(MAX_ALLOWED_TRANSFERS, `constraints.maxTransfers 不可大於 ${MAX_ALLOWED_TRANSFERS}。`),
      })
      .strict("constraints 含有未知欄位；請先更新 API_CONTRACT.md。"),
    scenario: z.enum(SCENARIOS, {
      errorMap: () => ({ message: `scenario 必須是 ${SCENARIOS.join(" | ")} 其中之一。` }),
    }),
  })
  .strict("請求含有未知欄位；請先更新 API_CONTRACT.md。");

export type ValidationResult =
  | { ok: true; value: TripRequest }
  | { ok: false; message: string; details: string[] };

export function validateTripRequest(input: unknown): ValidationResult {
  const parsed = tripRequestSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    );
    return { ok: false, message: "請求格式不正確。", details };
  }

  const value = parsed.data;
  const details: string[] = [];

  const arriveBy = parseArriveBy(value.arriveBy);
  if (!arriveBy.ok) {
    details.push(arriveBy.message);
  }

  const origin = findPlace(value.origin);
  if (!origin || origin.role !== "origin") {
    details.push(
      `origin 必須是走廊內的預設起點：${ORIGINS.map((place) => `${place.id}（${place.name}）`).join("、")}。`,
    );
  }

  const destination = findPlace(value.destination);
  if (!destination || destination.role !== "destination") {
    details.push(
      `destination 必須是走廊內的預設終點：${DESTINATIONS.map((place) => `${place.id}（${place.name}）`).join("、")}。`,
    );
  }

  if (details.length > 0) {
    return { ok: false, message: "請求內容不正確。", details };
  }

  return {
    ok: true,
    value: {
      origin: origin!.id,
      destination: destination!.id,
      arriveBy: arriveBy.ok ? arriveBy.iso : value.arriveBy,
      constraints: value.constraints,
      scenario: value.scenario,
    },
  };
}

/** 請求中允許出現的除錯欄位；未開啟故障注入時會被忽略。 */
export const FAULT_INJECTION_VALUES = ["internal_error", "delay"] as const;
export type FaultInjection = (typeof FAULT_INJECTION_VALUES)[number];

export function readFaultInjection(input: unknown): FaultInjection | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = (input as Record<string, unknown>)["faultInjection"];
  if (typeof raw !== "string") return null;
  return (FAULT_INJECTION_VALUES as readonly string[]).includes(raw)
    ? (raw as FaultInjection)
    : null;
}

/** 移除除錯欄位後再交給 strict schema，避免 demo 用的欄位污染正式契約。 */
export function stripDebugFields(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
  const clone: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  delete clone.faultInjection;
  return clone;
}
