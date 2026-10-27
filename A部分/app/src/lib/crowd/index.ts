/**
 * C1 · 擁擠風險引擎（成員 C）。
 *
 * 產品價值：把「幾點、在哪裡、擠不擠」變成可顯示、可溯源的定性等級。
 *
 * 硬約束（延續第一階段）：
 *   1. **只輸出 Low / Medium / High（+ Critical）與 Confidence**，絕不聲稱知道精確人數。
 *   2. **必須給出構成依據**（哪幾項把分數推上去），供解釋層溯源。
 *   3. 純函式、確定性：同輸入同輸出，不讀時鐘（時間由呼叫端以 ISO 傳入）。
 *
 * 這是**規則模型**，不是機器學習；門檻與配分集中在 `./thresholds.ts`。
 */
import { hkMinutesOfDay, zonedPartsFromEpoch } from "@/lib/time";
import type { Confidence } from "@/lib/types/decision";
import type { CrowdSignal, RiskService } from "@/lib/types/risk";
import type { PlaceKind } from "@/lib/types/journey";
import type { RouteQuality } from "@/lib/types/route";
import {
  CROWD_LEVEL_CUTOFFS,
  CROWD_LEVEL_SCORES,
  CROWD_QUALITY_CONFIDENCE_CAP,
  CROWD_RULES,
  CROWD_UNCALIBRATED_NOTE,
} from "./thresholds";

export type CrowdLevel = CrowdSignal["level"];

export interface CrowdFactor {
  /** 人類可讀的因素名（解釋層直接引用）。 */
  label: string;
  /** 這項貢獻的分數。 */
  points: number;
}

export interface CrowdRiskResult {
  level: CrowdLevel;
  confidence: Confidence;
  /** 內部規則分（0–100），僅供排序與解釋，不得當成人數或機率。 */
  score: number;
  factors: CrowdFactor[];
  /** 單行溯源字串，可直接填入 A 的 `CrowdSignal.evidence`。 */
  evidence: string;
  /** A 的風險引擎消費形狀（無人數，只有等級 + 置信度 + 依據）。 */
  signal: CrowdSignal;
  notices: string[];
}

export interface CrowdInput {
  /** 評估時間點（ISO，含 +08:00）—— 通常是該路段的預計到達／出發時間。 */
  at: string;
  /** 地點類型；`station` / `interchange` 有較高基線。 */
  placeKind?: PlaceKind | "interchange";
  /** 是否為大型換乘站。 */
  majorInterchange?: boolean;
  /** 周邊辦公樓密度（POI 代理訊號）。 */
  officeDensity?: "low" | "medium" | "high";
  /** 該路段已知延誤分鐘數（來自服務狀態）。 */
  delayMinutes?: number;
  /** 是否為跨境行程（口岸／邊境站）。 */
  crossesBorder?: boolean;
  /** B 的服務擁擠度（可選，作為輔助訊號，不取代本模型）。 */
  serviceCrowding?: RiskService["crowding"];
  /** 資料品質；非 live 時可信度下調。 */
  quality: RouteQuality;
}

function isWeekend(iso: string): boolean {
  const parts = zonedPartsFromEpoch(Date.parse(iso));
  return parts.weekday === "週六" || parts.weekday === "週日";
}

function levelOf(score: number): CrowdLevel {
  if (score >= CROWD_LEVEL_CUTOFFS.critical) return "critical";
  if (score >= CROWD_LEVEL_CUTOFFS.high) return "high";
  if (score >= CROWD_LEVEL_CUTOFFS.medium) return "medium";
  return "low";
}

function capConfidence(wanted: Confidence, quality: RouteQuality): Confidence {
  const cap = CROWD_QUALITY_CONFIDENCE_CAP[quality];
  const order: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
  return order[wanted] <= order[cap] ? wanted : cap;
}

/** 評估某地點在某時刻的擁擠風險。純函式、無網路、無時鐘。 */
export function assessCrowd(input: CrowdInput): CrowdRiskResult {
  const minute = hkMinutesOfDay(input.at);
  const factors: CrowdFactor[] = [];

  if (input.majorInterchange) {
    factors.push({ label: "大型換乘站基線人流", points: CROWD_RULES.majorInterchange });
  }

  const weekend = isWeekend(input.at);
  const weekdayPeak = !weekend && ((minute >= 450 && minute < 570) || (minute >= 1020 && minute < 1170));
  const weekendBusy = weekend && minute >= 660 && minute < 1200;
  if (weekdayPeak) {
    factors.push({ label: "工作日晚高峰（07:30–09:30 / 17:00–19:30）", points: CROWD_RULES.weekdayPeak });
  } else if (weekendBusy) {
    factors.push({ label: "週末假日繁忙時段（11:00–20:00）", points: CROWD_RULES.weekendBusy });
  }

  if (input.officeDensity === "high") {
    factors.push({ label: "周邊辦公樓密度高", points: CROWD_RULES.officeHigh });
  } else if (input.officeDensity === "medium") {
    factors.push({ label: "周邊辦公樓密度中等", points: CROWD_RULES.officeMedium });
  }

  if ((input.delayMinutes ?? 0) >= 10) {
    factors.push({ label: `已知延誤 ${input.delayMinutes} 分鐘造成月台積壓`, points: CROWD_RULES.delayed });
  }

  if (input.crossesBorder) {
    factors.push({ label: "跨境口岸／邊境站人流", points: CROWD_RULES.crossBorder });
  }

  const score = Math.min(
    100,
    CROWD_RULES.base + factors.reduce((sum, factor) => sum + factor.points, 0),
  );
  const level = levelOf(score);

  // 有服務擁擠度可作交叉驗證時，可信度最多提升一級，但不得超過品質上限。
  const crossChecked = input.serviceCrowding && input.serviceCrowding !== "unknown";
  const wanted: Confidence = crossChecked ? "high" : "medium";
  const confidence = capConfidence(wanted, input.quality);

  const evidencePieces = factors.length > 0 ? factors.map((factor) => `${factor.label}(+${factor.points})`) : ["未命中任何加權規則"];
  const evidence = `${evidencePieces.join("、")}；合計 ${score} 分 → ${level}。${CROWD_UNCALIBRATED_NOTE}`;

  const notices: string[] = [];
  if (input.quality !== "live") {
    notices.push(`資料品質為 ${input.quality}，擁擠可信度已下調。`);
  }
  if (!crossChecked) {
    notices.push("未取得服務擁擠度交叉驗證，可信度以規則預設為準。");
  }

  return {
    level,
    confidence,
    score,
    factors,
    evidence,
    signal: { level, confidence, evidence },
    notices,
  };
}

/** 對外顯示用的分數（與 A 的風險引擎一致）。 */
export function crowdScoreOf(level: CrowdLevel): number {
  return CROWD_LEVEL_SCORES[level];
}

export { CROWD_LEVEL_CUTOFFS, CROWD_RULES, CROWD_UNCALIBRATED_NOTE };
