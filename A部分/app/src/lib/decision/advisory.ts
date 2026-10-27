/**
 * 行動建議層（成員 C 的模組）—— 把規則層算好的結果翻譯成「可執行的下一步」。
 *
 * 這個檔案只做三件事，全部是**純函式**、不讀時鐘、不呼叫網路、不改變任何時間或路線：
 *
 * 1. `buildAction`：把 `status` + 時間 + 資料品質 變成 `depart_now / depart_at / wait / hold`。
 * 2. `buildSwitchDeadline`：把 `switchCondition` 文字裡的「幾點前」變成機器可讀的時刻。
 * 3. `buildBasis` / `buildUncertainty`：列出「每個數字從哪來」與「我們不知道什麼」。
 *
 * 設計原則（沿用 C 的介面契約 v1）：
 * - **缺失優於猜測**：不確定就寫進 `uncertainty`，不編造。
 * - **每個數字帶出處**：任何結論都要能在 `basis` 找到對應條目。
 * - 這裡**不產生任何新的事實**，只描述規則層已經算出的事實。
 */
import {
  CONFIDENCE_LABELS,
  CROWDING_LABELS,
  DATA_QUALITY_LABELS,
  DECISION_ACTION_LABELS,
  STATUS_LABELS,
} from "@/lib/labels";
import { addMinutes, formatHkStamp, formatHkTime } from "@/lib/time";
import type {
  Confidence,
  ContextSnapshot,
  DecisionAction,
  DecisionBasis,
  DecisionStatus,
  ExcludedRoute,
  RoutePlan,
  Scenario,
  WeatherSnapshot,
} from "@/lib/types";
import { ADVISORY_RULES, SEVERE_WEATHER_RULES, type ScenarioProfile } from "./thresholds";

/** 目前尚未有經過校準的歷史統計，因此不會產生 `statistics` 條目。 */
export const NO_STATISTICS_BASIS_NOTE =
  "本專案尚未完成歷史資料校準，因此沒有任何統計依據可以引用。";

export interface ActionInput {
  status: DecisionStatus;
  /** 建議出發時間；`unavailable` 時為 ""。 */
  departAt: string;
  /** 最遲起程時間；`unavailable` 時為 ""。 */
  latestDepartAt: string;
  /** 是否為「已過期且不可信」的資料（僅 live / cached 會被判定）。 */
  isStale: boolean;
  /** 注入的現在時間（ISO）。未提供時無法判斷出發窗口是否已開啟。 */
  now?: string;
}

function isValidIso(value: string | undefined): value is string {
  return typeof value === "string" && value !== "" && Number.isFinite(Date.parse(value));
}

/**
 * 行動建議的判定順序（互斥，且完全由輸入決定）：
 *
 * 1. 沒有可行路線 → `hold`（調整限制或改時間後再查）。
 * 2. 資料已過期 → `wait`（先核實官方資訊，不要照著過期資料出門）。
 * 3. 現在時間已達建議出發時間 → `depart_now`（窗口正在關閉）。
 * 4. 其餘 → `depart_at`。
 *
 * 注意：`action` 永遠不會推翻 `status`。`wait` 對應的仍然是 `uncertain`
 * （可以出發，但要先核實），不是 `unavailable`。
 */
export function buildAction(input: ActionInput): DecisionAction {
  if (input.status === "unavailable") return "hold";
  if (input.isStale) return "wait";

  if (isValidIso(input.now) && isValidIso(input.departAt)) {
    const nowMs = Date.parse(input.now);
    const departMs = Date.parse(input.departAt);
    const toleranceMs = ADVISORY_RULES.departNowToleranceMinutes * 60_000;
    if (nowMs + toleranceMs >= departMs) return "depart_now";
  }

  return "depart_at";
}

export interface SwitchDeadlineInput {
  /** 主路線的主要運輸方式。 */
  primaryMode: "rail" | "road";
  /** Plan B 的主要運輸方式。 */
  planBMode: "rail" | "road";
  /** 主路線的建議出發時間（ISO）。 */
  primaryDepartAt: string;
  /** Plan B 的建議出發時間（ISO）。 */
  planBDepartAt: string;
  /** Plan B 的候車切換門檻（分鐘）。 */
  waitSwitchMinutes: number;
}

/**
 * 仍能改用 Plan B 的最遲時刻。
 *
 * - 主路線為路面、Plan B 為鐵路（中斷情景）：使用者已經在巴士站，切換點發生在
 *   候車期間，因此最遲切換時刻 = 主路線出發 + Plan B 候車切換門檻。
 * - 其餘情況：必須在 Plan B 的建議出發時間之前離開起點，否則趕不上較慢的 Plan B。
 *
 * 沒有 Plan B 時回傳 ""（呼叫端負責判斷）。
 */
export function buildSwitchDeadline(input: SwitchDeadlineInput): string {
  if (input.primaryMode === "road" && input.planBMode === "rail") {
    if (!isValidIso(input.primaryDepartAt)) return "";
    return addMinutes(input.primaryDepartAt, input.waitSwitchMinutes);
  }
  return input.planBDepartAt;
}

export interface SevereWeatherReading {
  severe: boolean;
  /** 觸發的原因（人類可讀），沒有觸發時為 null。 */
  label: string | null;
}

/**
 * 判斷是否為「惡劣天氣」：暴風雨天氣，或警告字串包含黑色暴雨／八號或以上信號。
 *
 * 純字串與枚舉比對，不需要時鐘，也不做任何推測（拿不到警告就當作沒有觸發）。
 */
export function detectSevereWeather(weather: WeatherSnapshot): SevereWeatherReading {
  const conditionHit = SEVERE_WEATHER_RULES.severeConditions.includes(weather.condition);
  const warning = weather.warning?.trim() ?? "";
  const keywordHit =
    warning !== "" &&
    SEVERE_WEATHER_RULES.severeWarningKeywords.some((keyword) => warning.includes(keyword));

  if (!conditionHit && !keywordHit) return { severe: false, label: null };
  return { severe: true, label: warning !== "" ? warning : "暴風雨天氣" };
}

export interface ActionSafetyInput {
  /** 由 `buildAction` 算出的初步行動建議。 */
  action: DecisionAction;
  /** 惡劣天氣是否生效。 */
  severeWeather: boolean;
  /** 建議的主路線是否需要露天候車（主要運輸方式為路面）。 */
  exposedPrimary: boolean;
}

/**
 * 安全規則（覆寫 `action`，**不改任何時間數字**）：
 *
 * 以上惡劣天氣警告生效、而建議路線需要在露天候車時，
 * 行動建議降為 `wait` —— 先核實官方資訊、在安全處等候，而不是照著時間表去露天站牌等車。
 *
 * 為什麼不是 `hold`：`hold` 的語意是「沒有可行路線、不提供出發時間」。
 * 這裡仍然有一條可執行路線，只是風險偏高；硬把 `hold` 用在「叫使用者不要出門」
 * 會讓真正需要通勤的人無所適從，也會污染 `hold ⇔ unavailable` 這個不變條件。
 * 「如非必要，請留在安全處」的措辭放在 `uncertainty` 裡表達。
 */
export function applyActionSafety(input: ActionSafetyInput): DecisionAction {
  if (input.action === "hold") return "hold";
  if (input.severeWeather && input.exposedPrimary) return "wait";
  return input.action;
}

export interface BasisInput {
  scenario: Scenario;
  snapshot: ContextSnapshot;
  profile: ScenarioProfile;
  /** 主路線的評估結果；沒有可行路線時為 null。 */
  primaryPlan: RoutePlan | null;
  confidence: Confidence;
  confidenceScore: number;
  penalties: readonly string[];
  excludedRoutes: readonly ExcludedRoute[];
  isStale: boolean;
  /** 惡劣天氣觸發安全規則時的原因；未觸發為 null。 */
  severeWeatherLabel?: string | null;
  /** 因為路線狀態未確認而額外預留的分鐘數；沒有為 0。 */
  unknownRouteExtraMinutes?: number;
}

/**
 * 產生可追溯的依據清單。順序刻意安排成「規則 → 資料 → 信心」，讓評委由上往下讀
 * 就能回答「這句話哪來的」。
 */
export function buildBasis(input: BasisInput): DecisionBasis[] {
  const { snapshot, profile, primaryPlan, confidence, confidenceScore } = input;
  const basis: DecisionBasis[] = [];

  basis.push({
    claim: `建議出發時間的規則：arriveBy − （行程時間 + 延誤）− ${profile.riskBufferMinutes} 分鐘緩衝；到達範圍另計 ±${profile.varianceMinutes} 分鐘浮動。`,
    type: "rule",
    source: "API_CONTRACT.md §4.1 情景參數（演示設定，未經校準）",
    sourceUrl: null,
  });

  if (input.excludedRoutes.length > 0) {
    basis.push({
      claim: `${input.excludedRoutes.length} 條路線因服務中斷或超出「額外車費／轉乘次數」限制而被排除，不參與評分。`,
      type: "rule",
      source: "API_CONTRACT.md §4.2 路線過濾（硬約束先於評分）",
      sourceUrl: null,
    });
  }

  if (input.unknownRouteExtraMinutes && input.unknownRouteExtraMinutes > 0) {
    basis.push({
      claim: `有路線的服務狀態未確認，已在資料延誤之上額外預留 ${input.unknownRouteExtraMinutes} 分鐘（保守政策，不是統計估算）。`,
      type: "rule",
      source: "DECISION_ENGINE.md §12.6 資料不足時的保守假設",
      sourceUrl: null,
    });
  }

  if (input.severeWeatherLabel) {
    basis.push({
      claim: `「${input.severeWeatherLabel}」生效且建議路線需要露天候車，因此行動建議降為「先核實再出發」（安全規則，不改變任何時間數字）。`,
      type: "rule",
      source: "DECISION_ENGINE.md §12.6 惡劣天氣安全規則",
      sourceUrl: null,
    });
  }

  basis.push({
    claim: `所有緩衝、權重與信心門檻都是演示設定，未經歷史資料校準，因此只輸出定性信心，不輸出準時機率。${NO_STATISTICS_BASIS_NOTE}`,
    type: "rule",
    source: "專案範圍限制：DECISION_ENGINE.md §10 已知限制",
    sourceUrl: null,
  });

  for (const source of snapshot.sources.slice(0, 3)) {
    const quality = DATA_QUALITY_LABELS[source.quality];
    const note = source.note ? `；${source.note}` : "";
    basis.push({
      claim: `${source.label}（${quality}，更新於 ${formatHkStamp(source.updatedAt)}）${note}`,
      type: "data",
      source: source.label,
      sourceUrl: source.url,
    });
  }

  if (primaryPlan) {
    const delay =
      primaryPlan.delayMinutes > 0 ? `，延誤約 ${primaryPlan.delayMinutes} 分鐘` : "";
    basis.push({
      claim: `主路線「${primaryPlan.label}」的服務狀態（${STATUS_LABELS[primaryPlan.status]}${delay}）與人流（${CROWDING_LABELS[primaryPlan.crowding]}）來自本次資料快照。`,
      type: "data",
      source: "成員 B 的 ContextSnapshot.routes",
      sourceUrl: null,
    });

    const penaltyText =
      input.penalties.length > 0 ? `；扣分項：${input.penalties.join("、")}` : "";
    basis.push({
      claim: `到達信心「${CONFIDENCE_LABELS[confidence]}」由規則分數 ${confidenceScore}/100 得出${penaltyText}。`,
      type: "rule",
      source: "DECISION_ENGINE.md §7 到達信心規則",
      sourceUrl: null,
    });
  }

  return basis.slice(0, ADVISORY_RULES.maxBasisEntries);
}

export interface UncertaintyInput {
  status: DecisionStatus;
  snapshot: ContextSnapshot;
  primaryPlan: RoutePlan | null;
  planBPresent: boolean;
  confidence: Confidence;
  excludedRouteCount: number;
  hasDisruptedRoute: boolean;
  isStale: boolean;
  /** 注入的現在時間已超過最遲起程時間。 */
  missedLatestDeparture: boolean;
  latestDepartAt: string;
  action: DecisionAction;
  /** 惡劣天氣且需要露天候車時的原因；未觸發為 null。 */
  severeWeatherLabel?: string | null;
  /** 因為路線狀態未確認而額外預留的分鐘數；沒有為 0。 */
  unknownRouteExtraMinutes?: number;
}

/** 明確列出「我們不知道什麼」。寧可說不知道，也不要給出假確定的建議。 */
export function buildUncertainty(input: UncertaintyInput): string[] {
  const notes: string[] = [];
  const unavailable = input.status === "unavailable";

  if (unavailable) {
    notes.push(
      "目前沒有路線能同時滿足服務狀態與你的限制條件，因此不提供出發建議；調整限制條件或改時間後再查一次。",
    );
  }

  if (input.isStale) {
    notes.push(
      `本次資料已於 ${formatHkStamp(input.snapshot.expiresAt)} 過期，建議出發時間未經最新狀況核實。`,
    );
  }

  if (input.snapshot.quality !== "live") {
    notes.push(
      `本結果使用${DATA_QUALITY_LABELS[input.snapshot.quality]}，並非實時路況，不能當作即時資訊。`,
    );
  }

  if (!unavailable && input.primaryPlan && input.primaryPlan.status === "unknown") {
    const extra = input.unknownRouteExtraMinutes ?? 0;
    notes.push(
      extra > 0
        ? `主要路線的服務狀態未經確認，已在資料延誤之上額外預留 ${extra} 分鐘（保守政策）；實際情況可能更好或更差。`
        : "主要路線的服務狀態未經確認，已按保守假設估算，實際情況可能更好或更差。",
    );
  }

  if (!unavailable && !input.planBPresent) {
    notes.push("目前沒有可用的 Plan B，只有一條路線符合你的限制條件，一旦該路線受阻就沒有備案。");
  }

  if (input.excludedRouteCount > 0) {
    notes.push(
      `另有 ${input.excludedRouteCount} 條路線被排除，未納入本次比較；放寬限制後可能出現更好的選擇。`,
    );
  }

  if (input.hasDisruptedRoute) {
    notes.push("本走廊已有路線中斷，其餘路線可能連帶受影響（例如人流轉移、替代班次擠塞）。");
  }

  if (input.severeWeatherLabel) {
    notes.push(
      `「${input.severeWeatherLabel}」生效，而建議路線需要在露天候車：露天等候的風險可能高於時間延誤本身。如非必要，請留在安全處並持續觀察官方公告，再按最新的官方資訊決定。`,
    );
  }

  if (!unavailable && input.confidence !== "high") {
    notes.push(
      `到達信心為「${CONFIDENCE_LABELS[input.confidence]}」，出發前請再確認港鐵、運輸署與香港天文台的官方公告。`,
    );
  }

  if (input.missedLatestDeparture) {
    notes.push(
      `現在時間已超過最遲起程時間 ${formatHkTime(input.latestDepartAt)}，準時到達已無法保證。`,
    );
  }

  if (notes.length === 0) {
    notes.push("本次沒有已知的資料缺口；惟實際路況仍可能與估算不同。");
  }

  notes.push(
    `行動建議為「${DECISION_ACTION_LABELS[input.action]}」，本建議由規則與輸入資料產生，不構成出行保證。`,
  );

  return Array.from(new Set(notes)).slice(0, ADVISORY_RULES.maxUncertaintyEntries);
}
