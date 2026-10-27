/**
 * 決策層的可調整參數。
 *
 * ⚠️ 這裡所有數值都是「演示設定」，未經歷史資料校準。
 * 因此介面只輸出定性到達信心（high / medium / low），不輸出準時機率。
 * 校準工作需要成員 C 在有歷史資料後另行處理。
 */
import type { Confidence, Crowding, DecisionStatus, RouteStatus, Scenario } from "@/lib/types";

export interface ScenarioProfile {
  /** 在預計行程時間之上額外預留的緩衝（分鐘）。 */
  riskBufferMinutes: number;
  /** 到達時間範圍的上下浮動幅度（分鐘），用於計算 etaRange 的最遲值。 */
  varianceMinutes: number;
  /** 觸發切換至 Plan B 的主要路線延誤門檻（分鐘）。 */
  railDelaySwitchMinutes: number;
  /** 在 Plan B 上車點等候多久仍未登車就應該切換（分鐘）。 */
  planBWaitSwitchMinutes: number;
}

export const SCENARIO_PROFILES: Readonly<Record<Scenario, ScenarioProfile>> = Object.freeze({
  live: {
    riskBufferMinutes: 8,
    varianceMinutes: 15,
    railDelaySwitchMinutes: 10,
    planBWaitSwitchMinutes: 15,
  },
  normal: {
    riskBufferMinutes: 6,
    varianceMinutes: 10,
    railDelaySwitchMinutes: 10,
    planBWaitSwitchMinutes: 15,
  },
  heavy_rain: {
    riskBufferMinutes: 14,
    varianceMinutes: 20,
    railDelaySwitchMinutes: 15,
    planBWaitSwitchMinutes: 20,
  },
  disruption: {
    riskBufferMinutes: 16,
    varianceMinutes: 35,
    railDelaySwitchMinutes: 10,
    planBWaitSwitchMinutes: 15,
  },
});

/** 路線評分權重（總和為 1）。 */
export const SCORING_WEIGHTS = Object.freeze({
  time: 0.4,
  reliability: 0.25,
  transfers: 0.15,
  comfort: 0.1,
  cost: 0.1,
});

export const RELIABILITY_BY_STATUS: Readonly<Record<RouteStatus, number>> = Object.freeze({
  ok: 1,
  delayed: 0.6,
  unknown: 0.5,
  disrupted: 0,
});

export const COMFORT_BY_CROWDING: Readonly<Record<Crowding, number>> = Object.freeze({
  low: 1,
  medium: 0.6,
  unknown: 0.4,
  high: 0.25,
});

/** 到達信心的起始分數（0–100）。 */
export const CONFIDENCE_BASE: Readonly<Record<RouteStatus, number>> = Object.freeze({
  ok: 90,
  delayed: 60,
  unknown: 45,
  disrupted: 0,
});

export const CONFIDENCE_RULES = Object.freeze({
  delayPenaltyPerMinute: 1,
  delayPenaltyCap: 25,
  crowdingHighPenalty: 15,
  crowdingUnknownPenalty: 10,
  transfersAtLeastTwoPenalty: 10,
  slackLowThresholdMinutes: 5,
  slackLowPenalty: 15,
  fixtureDataPenalty: 5,
  disruptedRouteInSnapshotPenalty: 10,
  highThreshold: 70,
  mediumThreshold: 45,
});

export const CONFIDENCE_ORDER: Readonly<Record<Confidence, number>> = Object.freeze({
  high: 3,
  medium: 2,
  low: 1,
});

/**
 * status 的判定規則：
 * - 沒有任何可用路線 → unavailable
 * - 到達信心為 low，或沒有可用 Plan B → uncertain
 * - 其餘 → ready
 */
export function decideStatus(confidence: Confidence, hasPlanB: boolean): DecisionStatus {
  if (confidence === "low" || !hasPlanB) return "uncertain";
  return "ready";
}

/**
 * 「行動建議（`action`）」與「依據（`basis`）」的參數。
 *
 * 這些是**呈現規則**，不是新的評分：它們只把已經算好的 `status`、時間與資料品質
 * 翻譯成一步可執行的動作，因此不會改變任何使用者看到的時間或路線。
 */
export const ADVISORY_RULES = Object.freeze({
  /**
   * 注入的「現在時間」達到建議出發時間即視為 `depart_now`。
   * 容忍值為 0：不確定時寧可提醒使用者出發，也不要讓窗口悄悄關閉。
   */
  departNowToleranceMinutes: 0,
  /** `basis` 條目上限，避免回應過長；規則條目優先於資料條目。 */
  maxBasisEntries: 8,
  /** `uncertainty` 條目上限。 */
  maxUncertaintyEntries: 8,
});

/**
 * 資料不足時的**保守假設**（政策，不是統計）。
 *
 * 契約 §5 規定：路線狀態缺少時視為 `unknown`，不得當成「服務正常」。
 * 但 `unknown` 只降信心並不足夠 —— 如果行程時間仍按「零延誤」計算，
 * 引擎就會在建議裡寫「已按保守假設計算」卻排出一個正常班次的出發時間。
 * 因此這裡額外預留固定分鐘數，讓文字與數字一致。
 *
 * 成員 B 的實時路徑（只有天氣是 live、交通為 unknown）會直接走到這條規則。
 */
export const UNKNOWN_ROUTE_RULES = Object.freeze({
  /** 服務狀態未確認時，在資料延誤之上額外預留的行程時間（分鐘）。 */
  extraMinutes: 5,
});

/**
 * 惡劣天氣下的**安全規則**。
 *
 * 當以上警告生效、而建議路線需要露天候車（主要運輸方式為路面）時，
 * 行動建議降為「先核實再出發」，並明確提示露天等候的安全風險。
 * 這是安全建議，不是延誤估算 —— 它不改變任何時間數字。
 */
export const SEVERE_WEATHER_RULES = Object.freeze({
  /** 觸發安全規則的天氣狀況。 */
  severeConditions: ["storm"] as readonly string[],
  /** 觸發安全規則的警告關鍵字（比對 weather.warning）。 */
  severeWarningKeywords: [
    "黑色暴雨",
    "八號",
    "九號",
    "十號",
    "八号",
    "九号",
    "十号",
    "暴風",
    "烈風",
  ] as readonly string[],
});
