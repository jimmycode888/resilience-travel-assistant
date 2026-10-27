/**
 * DecisionResponse — 決策層（成員 C）→ 前端（成員 D）的輸出契約。
 *
 * 本檔案為「契約所有者：成員 A」維護。標記為 additive 的欄位可選，
 * 前端必須容忍它們缺失；其餘欄位為鎖定契約，不得更名或改型別。
 */
import type { DataQuality, DataSourceInfo } from "./context";
import type { Scenario } from "./request";

export type DecisionStatus = "ready" | "uncertain" | "unavailable";
export type Confidence = "high" | "medium" | "low";
export type RouteStatus = "ok" | "delayed" | "disrupted" | "unknown";
export type Crowding = "low" | "medium" | "high" | "unknown";
export type TransportMode = "mtr" | "bus" | "minibus" | "walk" | "tram" | "ferry";

/**
 * 決策層給使用者的「行動」建議（additive）。
 *
 * 這是把 `status` 翻譯成一步可執行的動作，**不是**新的事實：
 * `status` 仍然是權威欄位，`action` 只是它的可執行版本，讓 UI 與語音助手
 * 不必自行解讀 `departAt` 是否已到、資料是否可信。
 *
 * - `depart_now`：出發窗口正在關閉（注入的現在時間已達建議出發時間）。
 * - `depart_at`：按 `departAt` 出發（最常見）。
 * - `wait`：有可行路線，但資料不可信（已過期），先核實官方資訊再出發。
 * - `hold`：沒有可行路線（`status === "unavailable"`），留在安全處並調整條件後再查。
 */
export type DecisionAction = "depart_now" | "depart_at" | "wait" | "hold";

/**
 * 一條可追溯的依據（additive）。
 *
 * 「每個數字帶出處」是決策層的硬要求：任何寫進 `reasons`／`explanation` 的結論，
 * 都必須能在 `basis` 裡找到對應條目，否則就是模型或文案在編造事實。
 * 目前 `type` 只會出現 `rule` 與 `data`；`statistics` 保留給日後完成校準的回測結果
 * （在沒有歷史校準之前，本專案不得宣稱任何統計依據）。
 */
export interface DecisionBasis {
  /** 這條依據支撐的結論（人類可讀）。 */
  claim: string;
  /** `rule` = 專案規則；`data` = 本次輸入資料；`statistics` = 歷史統計（尚未有）。 */
  type: "rule" | "data" | "statistics";
  /** 來源名稱，例如「香港天文台」或「API_CONTRACT.md §4.1」。 */
  source: string;
  /** 來源連結；沒有可公開連結時為 null。 */
  sourceUrl: string | null;
}

/** 單一路線步驟。 */
export interface RouteStep {
  id: string;
  mode: TransportMode;
  /** 例如 "將軍澳線"；步行段為 null。 */
  line: string | null;
  from: string;
  to: string;
  /** ISO datetime，含 +08:00。 */
  departAt: string;
  /** ISO datetime，含 +08:00。 */
  arriveAt: string;
  durationMinutes: number;
  /** 給使用者看的一句話指令，例如「乘將軍澳線往北角」。 */
  instruction: string;
  note: string | null;
}

/** 一條候選路線的完整評估結果（additive，供前端顯示與 B/C 除錯用）。 */
export interface RoutePlan {
  routeId: string;
  label: string;
  summary: string;
  steps: RouteStep[];
  departAt: string;
  arriveAt: string;
  /** 由起點步行至上車點的時間（分鐘）；建議出發時間已包含此段。 */
  accessWalkMinutes: number;
  /** 含延誤的總時間（分鐘）。 */
  durationMinutes: number;
  /** 不含延誤的基準時間（分鐘）。 */
  baseDurationMinutes: number;
  delayMinutes: number;
  transfers: number;
  extraCostHkd: number;
  status: RouteStatus;
  crowding: Crowding;
  /** 該路線的主要風險，供結果頁顯示。 */
  riskNotes: string[];
  /** 決策層的加權分數（0–1，演示規則，未經校準）。 */
  score: number;
}

export interface ExcludedRoute {
  routeId: string;
  label: string;
  reason: string;
}

export interface DecisionResponse {
  status: DecisionStatus;
  /** status = "unavailable" 時為空字串 ""。 */
  departAt: string;
  /** additive：不計額外緩衝的最遲出發時間。 */
  latestDepartAt: string;
  /** [最早到達, 最遲到達]；status = "unavailable" 時為 ["", ""]。 */
  etaRange: [string, string];
  confidence: Confidence;
  primaryRoute: RouteStep[];
  /** 沒有可用備用路線時為空陣列 []。 */
  planB: RouteStep[];
  /** status = "unavailable" 時為空字串 ""。 */
  switchCondition: string;
  reasons: string[];
  dataUpdatedAt: string;
  dataQuality: DataQuality;

  // ---------- additive 欄位 ----------
  /** 主路線的完整評估結果（含時間、風險、分數）。 */
  primaryPlan: RoutePlan | null;
  /** Plan B 的完整評估結果；沒有 Plan B 時為 null。 */
  planBPlan: RoutePlan | null;
  /** 所有通過限制條件的候選路線，依分數由高至低排序。 */
  candidates: RoutePlan[];
  /** 被限制條件或中斷排除的候選路線，以及排除原因。 */
  excludedRoutes: ExcludedRoute[];
  /** 資料來源、品質與更新時間。不得把 fixture 標示為 live。 */
  dataSources: DataSourceInfo[];
  /** 需要提醒使用者的訊息，例如資料回退或日期不一致。 */
  notices: string[];
  /** 免責聲明：到達信心為定性判斷，不是校準過的準時機率。 */
  disclaimer: string;
  scenario: Scenario;
  /** 本次結果實際使用的服務日（香港時區）。 */
  serviceDate: string;
  /** 回應中持續回報的請求摘要，方便 B/C/D 除錯。 */
  generatedFor: {
    origin: string;
    destination: string;
    arriveBy: string;
  };
  /**
   * additive：可執行的行動建議，由 `status`、時間與資料品質推導。
   * 前端可以只用它顯示一顆主要按鈕，但不得用它覆蓋 `status` 的語意。
   */
  action: DecisionAction;
  /**
   * additive：仍能改用 Plan B 的最遲時刻（ISO +08:00）。
   * 沒有 Plan B 時為空字串 ""。這是 `switchCondition` 文字裡的「幾點前」的機器可讀版本。
   */
  switchDeadline: string;
  /** additive：本次結論的可追溯依據（規則條款與資料來源）。 */
  basis: DecisionBasis[];
  /** additive：明確列出「我們不知道什麼」，對應「缺失優於猜測」原則。 */
  uncertainty: string[];
}

/**
 * 結果是否包含可執行的出發建議。
 * 前端必須用此函式判斷，而不是檢查 `departAt` 是否非空。
 */
export function isActionable(
  response: DecisionResponse,
): response is DecisionResponse & { departAt: string; primaryPlan: RoutePlan } {
  return response.status !== "unavailable" && response.departAt !== "" && response.primaryPlan !== null;
}
