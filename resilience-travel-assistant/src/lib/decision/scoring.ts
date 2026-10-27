/**
 * 路線評分與到達信心計算（成員 C 的模組）。
 *
 * 純函式、無副作用、不讀取時鐘 —— 同樣的輸入永遠得到同樣的輸出。
 */
import type { Confidence, Crowding, RouteStatus } from "@/lib/types";
import {
  COMFORT_BY_CROWDING,
  CONFIDENCE_BASE,
  CONFIDENCE_RULES,
  RELIABILITY_BY_STATUS,
  SCORING_WEIGHTS,
} from "./thresholds";

export interface ScoringInput {
  /** 含延誤的行程時間（分鐘）。 */
  durationMinutes: number;
  /** 這批候選路線中最快與最慢的行程時間，用於正規化。 */
  fastestMinutes: number;
  slowestMinutes: number;
  status: RouteStatus;
  transfers: number;
  maxTransfers: number;
  crowding: Crowding;
  extraCostHkd: number;
  maxExtraCost: number;
}

export interface ConfidenceInput {
  status: RouteStatus;
  delayMinutes: number;
  crowding: Crowding;
  transfers: number;
  /** 已預留的緩衝（分鐘）。 */
  slackMinutes: number;
  /** 資料品質。vi === "fixture" 時會扣分，避免把演示資料說成高信心。 */
  dataQuality: "live" | "cached" | "fixture";
  /** 這批資料中是否有任何路線處於中斷狀態。 */
  hasDisruptedRoute: boolean;
}

/** 限制 0–1。 */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 限制 0–100。 */
function clamp100(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * 加權評分（0–1）。時間權重最高，其次是服務狀態；
 * 轉乘、舒適度與費用用來在時間接近時打破僵局。
 */
export function scoreRoute(input: ScoringInput): number {
  const span = input.slowestMinutes - input.fastestMinutes;
  const timeScore =
    span <= 0 ? 1 : clamp01((input.slowestMinutes - input.durationMinutes) / span);

  const reliabilityScore = RELIABILITY_BY_STATUS[input.status];
  const transfersScore = clamp01(1 - input.transfers / Math.max(1, input.maxTransfers));
  const comfortScore = COMFORT_BY_CROWDING[input.crowding];
  const costScore =
    input.maxExtraCost <= 0
      ? input.extraCostHkd <= 0
        ? 1
        : 0
      : clamp01(1 - input.extraCostHkd / input.maxExtraCost);

  const score =
    SCORING_WEIGHTS.time * timeScore +
    SCORING_WEIGHTS.reliability * reliabilityScore +
    SCORING_WEIGHTS.transfers * transfersScore +
    SCORING_WEIGHTS.comfort * comfortScore +
    SCORING_WEIGHTS.cost * costScore;

  // 來回乘 1000 再取整，避免浮點誤差令相同輸入產生不同分數。
  return Math.round(score * 1000) / 1000;
}

/** 依規則計算到達信心；同時回傳可解釋的分數與扣分項目。 */
export function computeConfidence(input: ConfidenceInput): {
  confidence: Confidence;
  score: number;
  penalties: string[];
} {
  const penalties: string[] = [];
  let score = CONFIDENCE_BASE[input.status];

  if (input.delayMinutes > 0) {
    const penalty = Math.min(
      CONFIDENCE_RULES.delayPenaltyCap,
      input.delayMinutes * CONFIDENCE_RULES.delayPenaltyPerMinute,
    );
    score -= penalty;
    penalties.push(`延誤 ${input.delayMinutes} 分鐘（-${penalty}）`);
  }

  if (input.crowding === "high") {
    score -= CONFIDENCE_RULES.crowdingHighPenalty;
    penalties.push(`人流高（-${CONFIDENCE_RULES.crowdingHighPenalty}）`);
  } else if (input.crowding === "unknown") {
    score -= CONFIDENCE_RULES.crowdingUnknownPenalty;
    penalties.push(`人流未確認（-${CONFIDENCE_RULES.crowdingUnknownPenalty}）`);
  }

  if (input.transfers >= 2) {
    score -= CONFIDENCE_RULES.transfersAtLeastTwoPenalty;
    penalties.push(`需轉乘 ${input.transfers} 次（-${CONFIDENCE_RULES.transfersAtLeastTwoPenalty}）`);
  }

  if (input.slackMinutes < CONFIDENCE_RULES.slackLowThresholdMinutes) {
    score -= CONFIDENCE_RULES.slackLowPenalty;
    penalties.push(
      `緩衝少於 ${CONFIDENCE_RULES.slackLowThresholdMinutes} 分鐘（-${CONFIDENCE_RULES.slackLowPenalty}）`,
    );
  }

  if (input.dataQuality !== "live") {
    score -= CONFIDENCE_RULES.fixtureDataPenalty;
    penalties.push(
      `${input.dataQuality === "fixture" ? "演示固定資料" : "快取資料"}（-${CONFIDENCE_RULES.fixtureDataPenalty}）`,
    );
  }

  if (input.hasDisruptedRoute) {
    score -= CONFIDENCE_RULES.disruptedRouteInSnapshotPenalty;
    penalties.push(`本走廊有中斷事件（-${CONFIDENCE_RULES.disruptedRouteInSnapshotPenalty}）`);
  }

  const normalized = clamp100(score);
  const confidence: Confidence =
    normalized >= CONFIDENCE_RULES.highThreshold
      ? "high"
      : normalized >= CONFIDENCE_RULES.mediumThreshold
        ? "medium"
        : "low";

  return { confidence, score: Math.round(normalized), penalties };
}
