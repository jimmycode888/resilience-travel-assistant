/**
 * TripRequest — 前端（成員 D）→ 後端（成員 A/B/C）的輸入契約。
 *
 * 本檔案為「契約所有者：成員 A」維護。任何欄位變更都必須同步更新
 * API_CONTRACT.md 並通知 B / C / D。未知欄位會被 API 拒絕（400 INVALID_INPUT），
 * 以避免各模組格式悄悄漂移。
 */

export const SCENARIOS = ["live", "normal", "heavy_rain", "disruption"] as const;

/** 演示情景。`live` 表示嘗試取用實時資料，失敗時自動回退到固定演示資料。 */
export type Scenario = (typeof SCENARIOS)[number];

/** 三個確定性演示情景（不含 live）。fixture 只覆蓋這三個。 */
export const FIXTURE_SCENARIOS = ["normal", "heavy_rain", "disruption"] as const;
export type FixtureScenario = (typeof FIXTURE_SCENARIOS)[number];

export interface TripConstraints {
  /** 相對最便宜候選路線可接受的額外車費（HKD）。0 表示不接受任何額外費用。 */
  maxExtraCost: number;
  /** 可接受的轉乘次數上限。 */
  maxTransfers: number;
}

export interface TripRequest {
  /** 預設地點 ID 或地點名稱，例如 "hang-hau-estate" 或 "坑口（富寧花園）"。 */
  origin: string;
  /** 預設地點 ID 或地點名稱。 */
  destination: string;
  /**
   * 最遲到達時間。
   * 接受 `YYYY-MM-DDTHH:mm`（以香港時區 UTC+8 解讀）或帶偏移量的完整 ISO 8601。
   * 回應中的同一欄位一律正規化為 `YYYY-MM-DDTHH:mm:ss+08:00`。
   */
  arriveBy: string;
  constraints: TripConstraints;
  scenario: Scenario;
}

export function isFixtureScenario(value: Scenario): value is FixtureScenario {
  return (FIXTURE_SCENARIOS as readonly string[]).includes(value);
}
