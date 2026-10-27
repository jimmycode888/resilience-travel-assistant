/**
 * C2 · 通關風險引擎（成員 C）—— 跨境工作流的核心。
 *
 * 與 Crowd Risk 的關鍵差異：
 *   1. **必須輸出排隊時間區間**（例如 20–40 分鐘），不得輸出單點精確值。
 *   2. 必須**校驗口岸開放時間**：已關閉的口岸不得參與當前時段的方案計算。
 *   3. 資料不足時如實降低 Confidence 並在文案標明「估算」。
 *   4. 純函式、確定性、不讀時鐘（時間由呼叫端以 ISO 傳入）。
 *
 * 單一權威來源（回應第二階段進度匯報的 C 缺口）：
 *   排隊區間**完全委派**給成員 B 的 `estimateBorderQueue()`
 *   （`@/lib/adapters/port-conditions`）；C 只在其上做**風險等級切分**與
 *   A 的 `BorderSignal` 轉換，不再自帶 `BORDER_QUEUE_BASE`／加成常數。
 *   因此本模組的輸出恆等於 B 的估算值（必要時加上呼叫端指定的假日加成）。
 */
import { findPort, formatOpenHours, isPortOpen, type BorderPort } from "@/lib/geo/ports";
import { estimateBorderQueue, QUEUE_ADJUSTMENTS } from "@/lib/adapters/port-conditions";
import { zonedPartsFromEpoch } from "@/lib/time";
import type { Confidence } from "@/lib/types/decision";
import type { BorderSignal, RiskLevel, RiskWeather } from "@/lib/types/risk";
import type { RouteQuality } from "@/lib/types/route";
import { BORDER_LEVEL_CUTOFFS, BORDER_UNCALIBRATED_NOTE, type BorderDirection } from "./thresholds";

export type BorderLevel = RiskLevel | "unknown";

export interface BorderFactor {
  label: string;
  /** 這項貢獻的排隊分鐘區間；純粹的狀態說明（例如口岸關閉）為 null。 */
  minutes: [number, number] | null;
}

export interface BorderRiskResult {
  portId: string | null;
  portName: string | null;
  /** 口岸在該時段（含排隊上限）是否開放。 */
  open: boolean;
  level: BorderLevel;
  confidence: Confidence;
  /** 排隊時間區間（分鐘）；口岸關閉或無法判定時為 null。 */
  queueMinutesRange: [number, number] | null;
  factors: BorderFactor[];
  /** A 的風險引擎消費形狀；口岸關閉時為 null（不得把關閉口岸算進方案）。 */
  signal: BorderSignal | null;
  notices: string[];
}

export interface BorderInput {
  portId: string | null;
  /** 抵達口岸的預計時間（ISO，含 +08:00）。 */
  at: string;
  direction: BorderDirection;
  dayType?: "weekday" | "weekend" | "holiday";
  /** 天氣（與 A 的風險引擎共用同一形狀）。只有 `condition` 會被 B 的估算器使用。 */
  weather?: RiskWeather | null;
  /** 服務這條跨境走廊的鐵路是否中斷。 */
  railDisruption?: boolean;
  quality: RouteQuality;
}

function levelOf(high: number): RiskLevel {
  if (high >= BORDER_LEVEL_CUTOFFS.high) return "high";
  if (high >= BORDER_LEVEL_CUTOFFS.medium) return "medium";
  return "low";
}

function unknownResult(input: BorderInput, notice: string): BorderRiskResult {
  return {
    portId: input.portId,
    portName: null,
    open: false,
    level: "unknown",
    confidence: "low",
    queueMinutesRange: null,
    factors: [],
    signal: null,
    notices: [notice],
  };
}

function isWeekendDate(iso: string): boolean {
  const weekday = zonedPartsFromEpoch(Date.parse(iso)).weekday;
  return weekday === "週六" || weekday === "週日";
}

/**
 * 評估單一口岸的通關風險。純函式、無網路、無時鐘。
 *
 * 排隊區間由 B 的 `estimateBorderQueue()` 決定（單一權威來源）；
 * C 只負責：口岸可否使用、風險等級、A 的 `BorderSignal`、以及文字說明。
 */
export function assessBorder(input: BorderInput): BorderRiskResult {
  if (!input.portId) {
    return unknownResult(input, "缺少可核對的口岸，不能確認通關可行性。");
  }
  const port: BorderPort | undefined = findPort(input.portId);
  if (!port) {
    return unknownResult(input, `未收錄的口岸（${input.portId}），不能確認通關可行性。`);
  }

  const estimate = estimateBorderQueue({
    portId: port.id,
    at: input.at,
    direction: input.direction,
    weather: input.weather ?? null,
    railDisrupted: input.railDisruption ?? false,
    quality: input.quality,
    observations: [],
  });

  const factors: BorderFactor[] = estimate.basis.map((entry) => ({ label: entry, minutes: null }));

  if (!estimate.open || !estimate.queueMinutesRange) {
    return {
      portId: port.id,
      portName: port.name,
      open: false,
      level: "unknown",
      confidence: estimate.confidence,
      queueMinutesRange: null,
      factors: [...factors, { label: `口岸未開放（${formatOpenHours(port)}）`, minutes: null }],
      signal: null,
      notices: [estimate.note],
    };
  }

  let range: [number, number] = estimate.queueMinutesRange;

  // B 只依「日期是否週末」加成；若呼叫端明確指定平日補假／公眾假期，
  // 補上 **B 的** 週末加成（值仍來自 B，不新增第二組常數）。
  if (input.dayType && input.dayType !== "weekday" && !isWeekendDate(input.at)) {
    const [low, high] = QUEUE_ADJUSTMENTS.weekend;
    range = [range[0] + low, range[1] + high];
    factors.unshift({ label: `公眾假期加成（dayType=${input.dayType}）`, minutes: [low, high] });
  }
  factors.unshift({ label: "排隊區間（B 的 estimateBorderQueue 估算）", minutes: range });

  const level = levelOf(range[1]);
  const confidence = estimate.confidence;
  const notices: string[] = [];
  if (input.quality !== "live") {
    notices.push(`資料品質為 ${input.quality}，排隊區間僅為估算。`);
  }
  notices.push(BORDER_UNCALIBRATED_NOTE);

  const note = `${estimate.note}（C 的風險等級：${level}）`;
  const signal: BorderSignal = {
    portId: port.id,
    queueMinutesRange: range,
    confidence,
    note,
  };

  return {
    portId: port.id,
    portName: port.name,
    open: true,
    level,
    confidence,
    queueMinutesRange: range,
    factors,
    signal,
    notices,
  };
}

/** 這個口岸是否可作為當前時段的方案（開放且可判定）。 */
export function portUsable(portId: string | null, at: string): boolean {
  if (!portId) return false;
  const port = findPort(portId);
  if (!port) return false;
  return isPortOpen(port, at);
}

export { BORDER_LEVEL_CUTOFFS, BORDER_UNCALIBRATED_NOTE, type BorderDirection };
