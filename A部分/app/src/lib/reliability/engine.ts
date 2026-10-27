/**
 * 可靠性評估引擎（成員 A 的核心模組）。
 *
 * 職責：把「一條候選路線」＋「它已算好的風險」轉成對外可顯示的可靠性結論：
 *   - 定性準時信心（高／中／低）
 *   - ETA 區間（最早／最遲到達）
 *   - 可溯源的依據（factors）
 *   - 誠實提示（notices）
 *
 * 為什麼吃「已算好的風險」而不是自己去算：
 *   可靠性與風險是兩個可獨立演進的模組。`assessReliability` 只依賴 `RouteRisk`
 *   的形狀，不依賴風險引擎的實作，因此兩邊可以各自測試、各自替換，不會互相綁死。
 *   這是刻意的**單向依賴**：ranking → reliability → 型別，而非反向呼叫風險引擎。
 *
 * ⚠️ 純函式：不得使用 Date.now() / Math.random()，同一輸入永遠得到同一輸出。
 */
import { RISK_LEVEL_LABELS, capConfidence } from "@/lib/risk/thresholds";
import { addMinutes } from "@/lib/time";
import type { Confidence } from "@/lib/types/decision";
import type { ReliabilityFactor, ReliabilityResult } from "@/lib/types/reliability";
import type { RiskRouteSource, RouteMode, RouteRisk } from "@/lib/types/risk";
import {
  CONFIDENCE_NOTE,
  ETA_FLOAT_MINUTES_BY_LEVEL,
  HIGH_RISK_PENALTY,
  QUALITY_PENALTY,
  RELIABILITY_CUTOFFS,
  TRANSFER_PENALTY,
} from "./thresholds";

export interface ReliabilityOptions {
  /** 評估時使用的路線模式；預設 "balanced"。 */
  mode?: RouteMode;
}

/** 把內部規則分數切成定性信心（切點集中在 thresholds）。 */
function confidenceOfScore(score: number): Confidence {
  if (score >= RELIABILITY_CUTOFFS.high) return "high";
  if (score >= RELIABILITY_CUTOFFS.medium) return "medium";
  return "low";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 轉乘次數 = 非步行路段數 - 1。
 *
 * 為什麼排除步行段：站內或站外的步行接駁不是「轉乘」，把它算進去會讓
 * 一條單純的「地鐵＋步行到目的地」被誤判成需要轉乘，低估可靠性。
 */
function transferCount(route: RiskRouteSource): number {
  const rides = route.journey.segments.filter((segment) => segment.mode !== "walk").length;
  return Math.max(0, rides - 1);
}

function buildFactors(
  route: RiskRouteSource,
  risk: RouteRisk,
  transfers: number,
): ReliabilityFactor[] {
  const factors: ReliabilityFactor[] = [
    {
      claim: `這條路線的整體風險為「${RISK_LEVEL_LABELS[risk.level]}」（風險分數 ${risk.score}）。`,
      evidence: `風險引擎的加權總分 breakdown.overall = ${risk.breakdown.overall}，等級門檻見 risk/thresholds.ts。`,
      source: "RISK_ENGINE.md §2",
      sourceUrl: null,
    },
    {
      claim:
        transfers >= 2
          ? `需要 ${transfers} 次轉乘，轉乘越多、誤點與趕不上接駁的風險越高。`
          : `只需 ${transfers} 次轉乘，接駁環節少、可靠性較高。`,
      evidence: `非步行路段數減一即為轉乘次數（transfers = ${transfers}）；轉乘 >= 2 時扣 ${TRANSFER_PENALTY} 分。`,
      source: "RISK_ENGINE.md §6",
      sourceUrl: null,
    },
    {
      claim: `本次結論的資料品質為「${route.quality}」。`,
      evidence: `資料品質直接限制信心上限：fixture 不得宣稱高信心（QUALITY_PENALTY[${route.quality}] = ${QUALITY_PENALTY[route.quality]}）。`,
      source: "API_CONTRACT.md §4.5",
      sourceUrl: null,
    },
    {
      claim: `ETA 區間依風險等級「${RISK_LEVEL_LABELS[risk.level]}」加上 ${ETA_FLOAT_MINUTES_BY_LEVEL[risk.level]} 分鐘緩衝。`,
      evidence: `緩衝分鐘數取自 ETA_FLOAT_MINUTES_BY_LEVEL，等級越高緩衝越大，不假裝知道精確到達時刻。`,
      source: "RISK_ENGINE.md §6",
      sourceUrl: null,
    },
  ];
  return factors;
}

function buildNotices(route: RiskRouteSource): string[] {
  const notices: string[] = [];
  if (route.quality === "fixture") {
    notices.push("本路線使用演示資料（fixture），信心與時間僅供示意，不得視為即時結果。");
  } else if (route.quality === "cached") {
    notices.push("本路線使用快取資料（cached），可能與即時路況與服務狀態有落差。");
  }
  notices.push(CONFIDENCE_NOTE);
  return notices;
}

/**
 * 評估一條路線的可靠性。
 *
 * 純函式：同一組 (route, risk, options) 永遠得到同一個結果。
 */
export function assessReliability(
  route: RiskRouteSource,
  risk: RouteRisk,
  options?: ReliabilityOptions,
): ReliabilityResult {
  const mode = options?.mode ?? "balanced";
  const transfers = transferCount(route);

  // 罰分：轉乘過多、風險過高、資料品質不足，各自扣分後再從 100 起扣。
  const penalty =
    (transfers >= 2 ? TRANSFER_PENALTY : 0) +
    (risk.level === "high" ? HIGH_RISK_PENALTY : 0) +
    QUALITY_PENALTY[route.quality];

  // ruleScore 只是內部排序用的規則分數，不得當成準時機率對外顯示。
  const ruleScore = clamp(Math.round(100 - risk.score - penalty), 0, 100);

  // 先分級，再依資料品質壓低上限——fixture / cached 不得宣稱高信心。
  const onTimeConfidence = capConfidence(confidenceOfScore(ruleScore), route.quality);

  const arriveAt = route.journey.arriveAt;
  const etaRange: [string, string] = [
    arriveAt,
    addMinutes(arriveAt, ETA_FLOAT_MINUTES_BY_LEVEL[risk.level]),
  ];

  return {
    routeId: route.id,
    label: route.label,
    mode,
    onTimeConfidence,
    confidenceNote: CONFIDENCE_NOTE,
    etaRange,
    riskLevel: risk.level,
    ruleScore,
    factors: buildFactors(route, risk, transfers),
    quality: route.quality,
    notices: buildNotices(route),
  };
}
