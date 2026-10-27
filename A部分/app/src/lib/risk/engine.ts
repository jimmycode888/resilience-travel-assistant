/**
 * 風險引擎（成員 A）——五因子模型的聚合層。
 *
 * 職責只有兩件：
 *   1. 把五個因子的分數，依「行程是否跨境」與「路線模式」選出的權重加權成 overall。
 *   2. 把可信度誠實地往下壓：資料品質不足時，整份評估的可信度不得宣稱 high。
 *
 * 為什麼要把「算法」與「權重」分開：四種路線模式（fastest / reliable / less_crowded / balanced）
 * 只調權重、不換算法，所以換模式時各因子的分數完全不變，只有 contribution 與 overall 改變。
 * 這樣「為什麼這條路線在這個模式下更危險」永遠能回指到同一組因子分數。
 */
import type { Confidence } from "@/lib/types/decision";
import type { RouteQuality } from "@/lib/types/route";
import type {
  RiskBreakdown,
  RiskContext,
  RiskFactor,
  RiskFactorId,
  RiskRouteSource,
  RouteMode,
  RouteRisk,
} from "@/lib/types/risk";
import { scoreBorder, scoreCrowd, scoreDisruption, scoreTransfer, scoreWeather, type FactorScore } from "./factors";
import { capConfidence, minConfidence, modeWeightsFor, riskLevelOf } from "./thresholds";

export interface AssessRiskOptions {
  /** 路線模式；預設 "balanced"。模式只調權重，不換算法。 */
  mode?: RouteMode;
}

/** 因子的固定順序：輸出的 notices 與 factors 必須穩定，才能對同一輸入保證決定性。 */
const FACTOR_ORDER: readonly RiskFactorId[] = Object.freeze([
  "weather",
  "crowd",
  "disruption",
  "transfer",
  "border",
]);

/**
 * 取兩者中較差的資料品質。
 *
 * 為什麼要兩者取差：候選路線本身有一層品質，整批訊號（天氣／服務／人流）又有一層。
 * 只要任何一邊不是 live，評估就不該宣稱 high——fixture 看起來像即時資料是最嚴重的產品錯誤。
 */
function weakerQuality(a: RouteQuality, b: RouteQuality): RouteQuality {
  if (a === b) return a;
  if (a === "fixture" || b === "fixture") return "fixture";
  return "cached";
}

/**
 * 評估一條候選路線的風險。
 *
 * 純函式：不使用 `Date.now()`、不呼叫網路、不改動輸入；同一輸入永遠得到同一輸出。
 */
export function assessRouteRisk(
  route: RiskRouteSource,
  context: RiskContext,
  options?: AssessRiskOptions,
): RouteRisk {
  const journey = route.journey;
  const mode: RouteMode = options?.mode ?? "balanced";
  const weights = modeWeightsFor(journey.crossesBorder, mode);

  // 因子看到的是「訊號品質」與「候選品質」中較差者，確保任一層降級都會反映到可信度上。
  const quality = weakerQuality(route.quality, context.quality);

  const scores: Record<RiskFactorId, FactorScore> = {
    weather: scoreWeather(context.weather, quality),
    crowd: scoreCrowd(context.crowd, context.service, quality),
    disruption: scoreDisruption(context.service, context.incidents ?? [], journey, quality),
    transfer: scoreTransfer(journey),
    border: scoreBorder(journey, context.border, quality),
  };

  const factors: RiskFactor[] = FACTOR_ORDER.map((id) => {
    const factor = scores[id];
    const weight = weights[id];
    return {
      id,
      score: factor.score,
      level: riskLevelOf(factor.score),
      weight,
      contribution: factor.score * weight,
      claim: factor.claim,
      evidence: factor.evidence,
      source: factor.source,
      sourceUrl: factor.sourceUrl,
    };
  });

  // weights 已由 modeWeightsFor 歸一化（總和為 1），因此加權和本身就是 0–100 的 overall。
  const overall = Math.round(
    FACTOR_ORDER.reduce((sum, id) => sum + scores[id].score * weights[id], 0),
  );

  const rawConfidence = FACTOR_ORDER.map((id) => scores[id].confidence).reduce(
    (acc: Confidence, current) => minConfidence(acc, current),
    "high",
  );

  const breakdown: RiskBreakdown = {
    weather: scores.weather.score,
    crowd: scores.crowd.score,
    disruption: scores.disruption.score,
    transfer: scores.transfer.score,
    border: scores.border.score,
    overall,
    weights,
    factors,
    confidence: capConfidence(rawConfidence, quality),
  };

  // notices 依固定因子順序串接，最後才補上品質提示，保證順序穩定。
  const notices: string[] = [];
  for (const id of FACTOR_ORDER) {
    notices.push(...scores[id].notices);
  }
  if (quality !== "live") {
    notices.push(`資料品質為 ${quality}，風險評估可信度已下調。`);
  }

  return {
    routeId: route.id,
    label: route.label,
    mode,
    crossesBorder: journey.crossesBorder,
    score: overall,
    level: riskLevelOf(overall),
    breakdown,
    // 這裡回報的是「這條候選本身」的品質，與用來壓低可信度的有效品質分開記錄。
    quality: route.quality,
    notices,
  };
}
