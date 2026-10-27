/**
 * 風險契約（契約所有者：成員 A）。
 *
 * 第二階段把第一階段的「路線分數」升級成**可溯源的五因子風險模型**：
 * 每個因子都是 0–100 的分數，並附帶 `claim / evidence / source`，
 * 讓任何顯示給使用者的風險結論都能回指到規則或資料（延續第一階段 `basis` 機制）。
 *
 * 五因子：weather / crowd / disruption / transfer / border。
 * - 境內行程：border 權重為 0，其餘四因子按比例歸一化。
 * - 跨境行程：border 為第五因子，權重 0.30（見 `risk/thresholds.ts`）。
 *
 * ⚠️ 硬約束：本模型輸出的是**定性風險等級**（low / medium / high），
 * 不是「發生機率」。在完成歷史校準之前，任何層級都不得宣稱統計依據。
 */
import type { Confidence } from "./decision";
import type { Journey } from "./journey";
import type { CandidateRoute, RouteQuality } from "./route";

/** 風險等級。只輸出這三級（+ confidence），不得聲稱知道精確人數或排隊分鐘數。 */
export type RiskLevel = "low" | "medium" | "high";

export type RiskFactorId = "weather" | "crowd" | "disruption" | "transfer" | "border";

/**
 * 路線模式。四種模式**只調權重，不換算法**（見 `risk/thresholds.ts` 的 `ROUTE_MODE_PROFILES`）。
 */
export type RouteMode = "fastest" | "reliable" | "less_crowded" | "balanced";

export interface RiskWeights {
  weather: number;
  crowd: number;
  disruption: number;
  transfer: number;
  border: number;
}

/**
 * 單一風險因子。
 *
 * `score` 是 0–100 的原始分數，`weight` 是歸一化後的權重（0–1），
 * `contribution = score × weight`，全部因子相加即為 `RiskBreakdown.overall`。
 */
export interface RiskFactor {
  id: RiskFactorId;
  /** 0–100，越高越危險。 */
  score: number;
  level: RiskLevel;
  /** 歸一化後的權重（同一份 breakdown 內各因子 weight 相加為 1）。 */
  weight: number;
  /** score × weight。 */
  contribution: number;
  /** 這條因子支撐的結論（人類可讀）。 */
  claim: string;
  /** 支撐該結論的具體證據（哪個資料、哪個規則條款）。 */
  evidence: string;
  /** 來源名稱，例如「香港天文台」或「RISK_ENGINE.md §3」。 */
  source: string;
  /** 來源連結；沒有可公開連結時為 null。 */
  sourceUrl: string | null;
}

export interface RiskBreakdown {
  weather: number;
  crowd: number;
  disruption: number;
  transfer: number;
  border: number;
  /** 加權總分 0–100。 */
  overall: number;
  /** 本次實際使用的權重（已歸一化）。 */
  weights: RiskWeights;
  /** 每個因子的分數、權重、貢獻與溯源，供解釋層與 UI 使用。 */
  factors: RiskFactor[];
  /** 這份風險評估本身的可信度。資料缺失時必須降級。 */
  confidence: Confidence;
}

export interface RouteRisk {
  routeId: string;
  label: string;
  /** 評估時使用的路線模式。 */
  mode: RouteMode;
  crossesBorder: boolean;
  /** 等於 `breakdown.overall`，方便呼叫端直接讀取。 */
  score: number;
  level: RiskLevel;
  breakdown: RiskBreakdown;
  /** 這條候選實際的資料品質（fixture 不得偽裝成 live）。 */
  quality: RouteQuality;
  /** 誠實提示（缺資料、降級、估算…）。 */
  notices: string[];
}

// ─────────────────────────────────────────────────────────────
// 風險引擎的輸入訊號
//
// 這些是 A 的「消費端契約」：把 B 的 `ContextSnapshot` 與 C 的
// Crowd / Border 輸出，正規化成風險引擎認得的最小形狀。
// C 的模組尚未落地時，這些欄位可以是 null——引擎會如實降級，不會編造。
// ─────────────────────────────────────────────────────────────

/** 天氣訊號（對應 `ContextSnapshot.weather` 的風險相關子集）。 */
export interface RiskWeather {
  condition: "clear" | "cloudy" | "rain" | "heavy_rain" | "storm";
  /** 例如「黑色暴雨警告信號」；沒有警告時為 null。 */
  warning: string | null;
  /** 天氣資料自己的更新時間（ISO +08:00）。 */
  updatedAt: string;
}

/** 路線服務狀態訊號（對應 `ContextSnapshot.routes[]`）。 */
export interface RiskService {
  status: "ok" | "delayed" | "disrupted" | "unknown";
  delayMinutes: number;
  crowding: "low" | "medium" | "high" | "unknown";
  /** 服務狀態的更新時間（ISO +08:00）。 */
  updatedAt?: string;
}

/** 交通事件訊號（對應 `ContextSnapshot.incidents[]`）。 */
export interface RiskIncident {
  id: string;
  title: string;
  detail: string;
  /** 受影響的站點／區域名稱，用於與路段比對；未提供時視為全走廊影響。 */
  affects?: readonly string[];
}

/**
 * 成員 C 的擁擠度輸出（消費端形狀）。
 *
 * 只有等級 + 置信度，**不得**帶精確人數。
 * C 的 `crowd/**` 尚未落地時傳 null，引擎會以保守中值 + low confidence 處理。
 */
export interface CrowdSignal {
  level: "low" | "medium" | "high" | "critical";
  confidence: Confidence;
  /** 構成依據（哪幾項推到了這個等級），供溯源。 */
  evidence: string;
}

/**
 * 成員 C 的通關風險輸出（消費端形狀）。
 *
 * 排隊時間必須是**區間 + 置信度**，不得是單點精確值。
 * 優先使用 `JourneySegment.border`（解析器已從供應商資料帶上來的口岸排隊）。
 */
export interface BorderSignal {
  portId: string;
  queueMinutesRange: [number, number];
  confidence: Confidence;
  note: string | null;
}

/** 風險引擎的輸入情境。 */
export interface RiskContext {
  weather?: RiskWeather | null;
  service?: RiskService | null;
  incidents?: readonly RiskIncident[];
  crowd?: CrowdSignal | null;
  border?: BorderSignal | null;
  /** 這批資料實際命中的品質層級（live / cached / fixture）。 */
  quality: RouteQuality;
}

/** 風險引擎接受的最小路線輸入（`CandidateRoute` 的子集，方便測試注入）。 */
export type RiskRouteInput = Pick<CandidateRoute, "id" | "label" | "quality" | "journey">;

/** 型別層面的保證：`CandidateRoute` 可直接餵給風險引擎。 */
export type RiskRouteSource = CandidateRoute | RiskRouteInput;

/** 便利函式：取得某一條風險因子（找不到時回傳 undefined）。 */
export function findRiskFactor(risk: RouteRisk, id: RiskFactorId): RiskFactor | undefined {
  return risk.breakdown.factors.find((factor) => factor.id === id);
}

/** 便利函式：依分數由高至低取出前 N 個因子（供解釋層挑「最該說的那幾項」）。 */
export function topRiskFactors(risk: RouteRisk, count = 3): RiskFactor[] {
  return [...risk.breakdown.factors]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, Math.max(0, count));
}

/** 便利函式：這條路線是否跨境（風險引擎以此選權重表）。 */
export function routeCrossesBorder(journey: Journey): boolean {
  return journey.crossesBorder;
}
