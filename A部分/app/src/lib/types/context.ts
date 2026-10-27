/**
 * ContextSnapshot — 資料適配層（成員 B）→ 決策層（成員 C）的內部契約。
 *
 * B 負責把天氣、交通與演示情景統一成這個格式；C 只讀這個格式，不直接呼叫外部 API。
 * 本檔案為「契約所有者：成員 A/B」共同維護。
 *
 * 對應成員 B 指令書的欄位要求：
 * - scenario / weather（含 updatedAt）/ transit 路線狀態（含 updatedAt）
 * - source（含名稱、URL、說明）/ dataQuality / collectedAt / expiresAt
 * 其中「transit 路線狀態」在本專案命名為 `routes`（同一份資料，不另開欄位）。
 */
import type { Crowding, RouteStatus } from "./decision";
import type { Scenario } from "./request";

/** 資料品質標記。嚴禁把 fixture 標示成 live。 */
export type DataQuality = "live" | "cached" | "fixture";

export type WeatherCondition = "clear" | "cloudy" | "rain" | "heavy_rain" | "storm";

export interface WeatherSnapshot {
  condition: WeatherCondition;
  /** 例如 "黑色暴雨警告信號"；無警告時為 null。 */
  warning: string | null;
  rainfallMmPerHour: number | null;
  temperatureC: number | null;
  note: string | null;
  /** 這一份天氣資料的更新時間（ISO，含 +08:00）。 */
  updatedAt: string;
}

export interface RouteServiceStatus {
  /** 對應 corridor 內的路線 ID。 */
  routeId: string;
  status: RouteStatus;
  /** 相對正常情況的額外行車時間（分鐘）。 */
  delayMinutes: number;
  crowding: Crowding;
  /** 給使用者看的補充說明，例如「北角站轉乘通道人流管制」。 */
  note: string | null;
  /** 受影響區段的人類可讀描述，例如 "坑口站 → 北角站"。 */
  affectedSegments: string[];
  /** 這一份路線狀態的更新時間（ISO，含 +08:00）。 */
  updatedAt: string;
}

export interface Incident {
  id: string;
  kind: "mtr" | "bus" | "road" | "weather" | "other";
  title: string;
  detail: string;
  /** ISO datetime（含偏移量）。 */
  since: string;
}

export interface DataSourceInfo {
  id: string;
  label: string;
  /** 來源 URL 或說明（例如官方資料集連結、或 "演示固定資料"）。 */
  url: string | null;
  quality: DataQuality;
  /** ISO datetime（含偏移量）。 */
  updatedAt: string;
  note: string | null;
}

export interface ContextSnapshot {
  /** 這份資料所屬的情景。fixture 只覆蓋三個確定性情景；實時資料為 "live"。 */
  scenario: Scenario;
  /** 這份樣本所屬的服務日（香港時區），例如 "2026-10-13"。 */
  serviceDate: string;
  /** 資料擷取時間（ISO，含 +08:00）。決策結果的 dataUpdatedAt 直接採用此值。 */
  collectedAt: string;
  /**
   * 這份資料的失效時間（ISO，含 +08:00）。
   * 超過此時間視為過期：決策層會扣減到達信心並把狀態降為 uncertain，
   * 而不是假裝資料仍然有效（見 decision/scoring.ts 的 staleDataPenalty）。
   */
  expiresAt: string;
  quality: DataQuality;
  weather: WeatherSnapshot;
  routes: RouteServiceStatus[];
  incidents: Incident[];
  sources: DataSourceInfo[];
}

/** 適配層的統一回傳：一份快照加上需要告知使用者的回退訊息。 */
export interface ContextResolution {
  snapshot: ContextSnapshot;
  /** 例如「實時資料逾時，已回退至固定演示資料」。 */
  notices: string[];
  /** 實際生效的品質等級（等於 snapshot.quality，方便呼叫端直接使用）。 */
  quality: DataQuality;
  /** 這一層回退鏈實際命中的層級。 */
  tier?: "live" | "cached" | "fixture" | "fixture_scenario";
}
