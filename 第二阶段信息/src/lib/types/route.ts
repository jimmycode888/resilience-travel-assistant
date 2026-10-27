/**
 * 路線讀取契約（契約所有者：成員 A）。
 *
 * 兩層設計，讓「換供應商」不必改解析器：
 *   1. 供應商私有格式（OSRM / 巴士 API / 內部走廊資料）
 *      → 先轉成**中立形狀** `RawJourney`（本檔案）
 *   2. `route/parse.ts` 把 `RawJourney` → `Journey`（journey.ts）
 *
 * 解析器只認識 `RawJourney`，所以新增供應商時不需要碰解析邏輯與測試。
 */
import type { BorderQueue, Journey, JourneyMode, LonLat } from "./journey";

export type ProviderId = "osrm" | "corridor" | "fixture";

/** 這條路線實際命中的資料層級（沿用第一階段 live → cached → fixture 三退路）。 */
export type RouteQuality = "live" | "cached" | "fixture";

export interface RouteQuery {
  /** 地點 ID（見 `geo/places.ts` 註冊表）。 */
  origin: string;
  destination: string;
  /** ISO datetime（含 +08:00）。 */
  departAt: string;
  /** 指定口岸時只回傳經過該口岸的候選（跨境 Plan B 的「換口岸」用）。 */
  preferPortId?: string;
  /** 限制交通方式；未指定表示不限制。 */
  modes?: readonly JourneyMode[];
}

export interface RawPoint {
  name: string;
  lat: number;
  lon: number;
}

/** 單一步驟的中立形狀。 */
export interface RawStep {
  /** 供應商原始 mode 或 profile（例如 "walking" / "driving" / "mtr"）。 */
  mode: string;
  /** 線路名或道路名。 */
  line: string | null;
  from: RawPoint;
  to: RawPoint;
  durationMinutes: number;
  /** [lon, lat] 折線；供應商沒給時留空陣列。 */
  geometry: LonLat[];
  viaStations?: string[];
  viaDistricts?: string[];
}

export interface RawJourney {
  id: string;
  label: string;
  steps: RawStep[];
  /** ISO datetime（含 +08:00）。 */
  departAt: string;
  /**
   * 通關段排隊資訊，key 為口岸 ID。
   * 由口岸模型（成員 C）提供，供應商不負責推算排隊時間。
   */
  borderQueues?: Record<string, BorderQueue>;
}

export interface RawRoute {
  provider: ProviderId;
  quality: RouteQuality;
  journey: RawJourney;
  /** 這一筆路線的取得時間（ISO，含 +08:00）。 */
  fetchedAt: string;
  notices: string[];
}

export interface RouteProvider {
  id: ProviderId;
  /**
   * `journey`：供應商能給出完整路線（含交通方式）。
   * `geometry`：只補幾何（例如用 OSRM 把步行段換成真實路網）。
   */
  provides: "journey" | "geometry";
  /**
   * 取得候選路線。逾時或失敗必須 throw（由呼叫端走三退路）。
   * 回傳 null 代表「這次沒有資料」，呼叫端同樣會回退。
   */
  fetch(query: RouteQuery, signal: AbortSignal): Promise<RawRoute[] | null>;
}

/** 解析完成、可直接交給風險引擎的候選路線。 */
export interface CandidateRoute {
  id: string;
  label: string;
  provider: ProviderId;
  quality: RouteQuality;
  journey: Journey;
}

export interface RouteResolution {
  query: RouteQuery;
  candidates: CandidateRoute[];
  /** 這批候選實際的資料品質。 */
  quality: RouteQuality;
  tier: "live" | "cached" | "fixture";
  /** 需要告知使用者的回退訊息（例如「實時路網逾時，已使用參考座標」）。 */
  notices: string[];
  fetchedAt: string;
}
