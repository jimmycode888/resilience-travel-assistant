/**
 * 資料適配層的內部介面（成員 B 的模組）。
 *
 * 成員 B 只需實作 `LiveDataProvider`，決策層與前端都不需要改動。
 */
import type {
  ContextSnapshot,
  Incident,
  RouteServiceStatus,
  Scenario,
  WeatherSnapshot,
} from "@/lib/types";

/** 實時來源回傳的部分資料；未提供的欄位會沿用上一層（快取或 fixture）。 */
export interface LiveDataPayload {
  weather?: WeatherSnapshot;
  routes?: RouteServiceStatus[];
  incidents?: Incident[];
}

export interface LiveDataProvider {
  /** 穩定 ID，用於快取鍵與資料來源標示。 */
  id: string;
  /** 這個來源負責哪些欄位，只用於訊息與除錯。 */
  provides: Array<"weather" | "routes" | "incidents">;
  /**
   * 取得資料。逾時或失敗時必須 throw（由呼叫端回退）。
   * 回傳 null 代表「已設定但這次沒有資料」，呼叫端同樣會回退。
   */
  fetch(signal: AbortSignal): Promise<LiveDataPayload | null>;
}

export interface AdapterEnvironment {
  /** 目前情景。 */
  scenario: Scenario;
  /** 注入時鐘，方便測試；回傳 epoch 毫秒。 */
  now: () => number;
  /** 單一來源的逾時（毫秒）。 */
  timeoutMs: number;
  /** 已註冊的實時來源；預設由環境變數決定。 */
  providers: readonly LiveDataProvider[];
  /** 快取。 */
  cache: SnapshotCacheLike;
}

export interface SnapshotCacheLike {
  get(key: string, nowMs: number): ContextSnapshot | null;
  set(key: string, snapshot: ContextSnapshot, nowMs: number): void;
}

/** 回退鏈的每一層，供日誌與測試斷言使用。 */
export type FallbackTier = "live" | "cached" | "fixture" | "fixture_scenario";
