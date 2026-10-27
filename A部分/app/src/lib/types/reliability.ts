/**
 * 可靠性契約（契約所有者：成員 A）。
 *
 * 第二階段把第一階段的「到達信心」升級成完整的可靠性評估：
 *   - **定性準時信心**（高／中／低）—— 絕不是百分比；
 *   - **ETA 區間**（最早到達 / 最遲到達）；
 *   - **可溯源依據**（factors），讓每個結論都能回指規則或資料；
 *   - **四模式路線排序**（Fastest / Reliable / Less Crowded / Balanced）。
 *
 * ⚠️ 產品倫理硬約束（延續第一階段）：
 *   在完成歷史資料校準之前，**不得輸出「準時機率 88%」這類數字**。
 *   `ruleScore` 只是內部排序用的規則分數，**不得**當成機率對使用者顯示。
 *   對外一律使用 `onTimeConfidence`（高／中／低）＋ `confidenceNote` 說明。
 */
import type { Confidence } from "./decision";
import type { RiskRouteSource, RouteRisk, RiskLevel, RouteMode } from "./risk";
import type { RouteQuality } from "./route";

/** 一條可追溯的可靠性依據（沿用第一階段 `DecisionBasis` 的精神）。 */
export interface ReliabilityFactor {
  /** 這條依據支撐的結論（人類可讀）。 */
  claim: string;
  /** 支撐該結論的具體證據。 */
  evidence: string;
  /** 來源名稱。 */
  source: string;
  /** 來源連結；沒有時為 null。 */
  sourceUrl: string | null;
}

export interface ReliabilityResult {
  routeId: string;
  label: string;
  mode: RouteMode;
  /**
   * 定性準時到達信心（高／中／低）。
   * **這是分級，不是機率**；UI 必須顯示 `confidenceNote`。
   */
  onTimeConfidence: Confidence;
  /** 為什麼不是百分比（未校準聲明），必須與 `onTimeConfidence` 一起顯示。 */
  confidenceNote: string;
  /** ETA 區間 [最早到達, 最遲到達]（ISO +08:00）。 */
  etaRange: [string, string];
  /** 由風險分數推得的定性風險等級。 */
  riskLevel: RiskLevel;
  /**
   * 內部排序用的規則分數（0–100，越高越可靠）。
   * ⚠️ 不得當成準時機率對外顯示。
   */
  ruleScore: number;
  /** 可追溯依據。 */
  factors: ReliabilityFactor[];
  /** 這條候選實際的資料品質。 */
  quality: RouteQuality;
  notices: string[];
}

/**
 * 排序的輸入：一條候選 + 它已算好的風險。
 *
 * 刻意不讓排序模組自己去算風險——排序只依賴 `RouteRisk` 的形狀，
 * 不依賴風險引擎的實作，兩個模組因此可以獨立演進與測試。
 */
export interface RankableRoute {
  route: RiskRouteSource;
  risk: RouteRisk;
}

/** 排序後的一條候選路線（含風險與可靠性）。 */
export interface RankedRoute {
  routeId: string;
  label: string;
  mode: RouteMode;
  /** 綜合推薦分 0–100，越高越推薦。 */
  rankScore: number;
  /** 時間分 0–100（同組中最快者 100、最慢者 0，線性內插）。 */
  timeScore: number;
  /** 風險分 0–100（越低越好）。 */
  riskScore: number;
  durationMinutes: number;
  risk: RouteRisk;
  reliability: ReliabilityResult;
}

export interface RouteRanking {
  mode: RouteMode;
  /** 依 `rankScore` 由高至低排序。 */
  ranked: RankedRoute[];
  /** 最高分的路線 ID；沒有候選時為 null。 */
  recommendedRouteId: string | null;
  notices: string[];
}

/** 便利函式：取得推薦路線（沒有候選時為 null）。 */
export function recommendedRoute(ranking: RouteRanking): RankedRoute | null {
  if (!ranking.recommendedRouteId) return null;
  return ranking.ranked.find((route) => route.routeId === ranking.recommendedRouteId) ?? null;
}
