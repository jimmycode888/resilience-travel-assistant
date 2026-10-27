/**
 * 風險引擎的權重與門檻（成員 A 定稿）。
 *
 * 這個檔案是第二階段風險模型的**單一常數來源**：
 *   - 境內四因子 / 跨境五因子的權重表
 *   - 風險等級切分
 *   - 四種路線模式的排序權重（只調權重，不換算法）
 *   - 資料品質對可信度的上限
 *
 * 為什麼集中在這裡：第一階段的教訓是「門檻散落在邏輯裡就沒人能 review」。
 * 權重先定死、不調參，之後要用真實資料校準時只改這一個檔案。
 */
import type { Confidence } from "@/lib/types/decision";
import type { RiskLevel, RiskWeights, RouteMode } from "@/lib/types/risk";

// ─────────────────────────────────────────────────────────────
// 1. 風險等級切分
// ─────────────────────────────────────────────────────────────

/** 0–39 → low；40–69 → medium；70–100 → high。 */
export const RISK_LEVEL_CUTOFFS = Object.freeze({ low: 40, high: 70 });

export function riskLevelOf(score: number): RiskLevel {
  if (score >= RISK_LEVEL_CUTOFFS.high) return "high";
  if (score >= RISK_LEVEL_CUTOFFS.low) return "medium";
  return "low";
}

export const RISK_LEVEL_LABELS: Readonly<Record<RiskLevel, string>> = Object.freeze({
  low: "低",
  medium: "中",
  high: "高",
});

export const RISK_FACTOR_LABELS: Readonly<Record<keyof RiskWeights, string>> = Object.freeze({
  weather: "天氣",
  crowd: "人流",
  disruption: "服務中斷",
  transfer: "轉乘",
  border: "通關",
});

// ─────────────────────────────────────────────────────────────
// 2. 因子權重表（先定死，不調參）
// ─────────────────────────────────────────────────────────────

/** 境內行程：四因子，border 為 0。 */
export const RISK_WEIGHTS_DOMESTIC: RiskWeights = Object.freeze({
  weather: 0.25,
  crowd: 0.25,
  disruption: 0.35,
  transfer: 0.15,
  border: 0,
});

/** 跨境行程：加第五因子 border（權重 0.30）。 */
export const RISK_WEIGHTS_CROSS_BORDER: RiskWeights = Object.freeze({
  weather: 0.15,
  crowd: 0.2,
  disruption: 0.25,
  transfer: 0.1,
  border: 0.3,
});

/** 依行程類型選擇權重表。 */
export function weightsFor(crossesBorder: boolean): RiskWeights {
  return crossesBorder ? RISK_WEIGHTS_CROSS_BORDER : RISK_WEIGHTS_DOMESTIC;
}

/** 權重總和。 */
export function weightSum(weights: RiskWeights): number {
  return (
    weights.weather + weights.crowd + weights.disruption + weights.transfer + weights.border
  );
}

/**
 * 把權重歸一化到總和為 1。
 *
 * 為什麼需要：模式倍率與自訂權重都可能讓總和不再是 1；
 * 若不歸一化，`overall` 會隨權重總和膨脹，跨路線就不可比。
 * 總和為 0（理論上不該發生）時退回境內四因子均分，避免除以零。
 */
export function normalizeWeights(weights: RiskWeights): RiskWeights {
  const sum = weightSum(weights);
  if (sum <= 0) {
    return { weather: 0.25, crowd: 0.25, disruption: 0.35, transfer: 0.15, border: 0 };
  }
  return {
    weather: weights.weather / sum,
    crowd: weights.crowd / sum,
    disruption: weights.disruption / sum,
    transfer: weights.transfer / sum,
    border: weights.border / sum,
  };
}

/** 逐項相乘後歸一化（模式只調權重，不動算法）。 */
export function applyWeights(
  base: RiskWeights,
  multipliers: RiskWeights,
): RiskWeights {
  return normalizeWeights({
    weather: base.weather * multipliers.weather,
    crowd: base.crowd * multipliers.crowd,
    disruption: base.disruption * multipliers.disruption,
    transfer: base.transfer * multipliers.transfer,
    border: base.border * multipliers.border,
  });
}

// ─────────────────────────────────────────────────────────────
// 3. 四種路線模式（只調權重，不換算法）
// ─────────────────────────────────────────────────────────────

export interface RouteModeProfile {
  label: string;
  description: string;
  /** 排序分中「時間」的佔比（0–1）。 */
  timeWeight: number;
  /** 排序分中「風險」的佔比（0–1）。 */
  riskWeight: number;
  /** 風險內部因子權重的倍率（相對基礎權重表）。 */
  factorMultipliers: RiskWeights;
}

const NEUTRAL_MULTIPLIERS: RiskWeights = Object.freeze({
  weather: 1,
  crowd: 1,
  disruption: 1,
  transfer: 1,
  border: 1,
});

export const ROUTE_MODE_PROFILES: Readonly<Record<RouteMode, RouteModeProfile>> = Object.freeze({
  fastest: {
    label: "最快",
    description: "以總時間為主要考量，風險只佔少數。",
    timeWeight: 0.7,
    riskWeight: 0.3,
    factorMultipliers: NEUTRAL_MULTIPLIERS,
  },
  reliable: {
    label: "最穩",
    description: "優先避開服務中斷與多重轉乘，寧可慢一點也要穩。",
    timeWeight: 0.35,
    riskWeight: 0.65,
    factorMultipliers: Object.freeze({
      weather: 1.2,
      crowd: 1,
      disruption: 1.6,
      transfer: 1.4,
      border: 1.2,
    }),
  },
  less_crowded: {
    label: "較不擠",
    description: "把人流風險權重放大，換取更舒適的乘車體驗。",
    timeWeight: 0.35,
    riskWeight: 0.65,
    factorMultipliers: Object.freeze({
      weather: 1,
      crowd: 2.2,
      disruption: 1,
      transfer: 1.1,
      border: 1.1,
    }),
  },
  balanced: {
    label: "均衡",
    description: "時間與風險各佔一半，預設模式。",
    timeWeight: 0.5,
    riskWeight: 0.5,
    factorMultipliers: NEUTRAL_MULTIPLIERS,
  },
});

export function modeProfileOf(mode: RouteMode): RouteModeProfile {
  return ROUTE_MODE_PROFILES[mode];
}

/** 某個模式下、某種行程類型實際使用的因子權重。 */
export function modeWeightsFor(crossesBorder: boolean, mode: RouteMode): RiskWeights {
  return applyWeights(weightsFor(crossesBorder), modeProfileOf(mode).factorMultipliers);
}

export const ROUTE_MODES: readonly RouteMode[] = Object.freeze([
  "fastest",
  "reliable",
  "less_crowded",
  "balanced",
]);

// ─────────────────────────────────────────────────────────────
// 4. 資料品質對可信度的上限
// ─────────────────────────────────────────────────────────────

const CONFIDENCE_RANK: Readonly<Record<Confidence, number>> = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
});

/**
 * 取兩個可信度中較低者。
 *
 * 用途：資料品質是 `fixture` / `cached` 時，風險評估的可信度不得宣稱 `high`——
 * 演示資料看起來像即時資料是最嚴重的一類產品錯誤。
 */
export function minConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

/** 資料品質允許的最高可信度。 */
export function confidenceCapForQuality(quality: "live" | "cached" | "fixture"): Confidence {
  if (quality === "live") return "high";
  return "medium";
}

/** 依品質壓低可信度。 */
export function capConfidence(
  confidence: Confidence,
  quality: "live" | "cached" | "fixture",
): Confidence {
  return minConfidence(confidence, confidenceCapForQuality(quality));
}

/** 供除錯與測試：把可信度轉成可比較的序數（low=0 / medium=1 / high=2）。 */
export function confidenceRank(confidence: Confidence): number {
  return CONFIDENCE_RANK[confidence];
}
