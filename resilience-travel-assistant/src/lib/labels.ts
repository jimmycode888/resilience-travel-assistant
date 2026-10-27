import type { Crowding, DecisionAction, RouteStatus, Scenario } from "@/lib/types";

/** 中文（香港）顯示標籤的唯一來源，前端與決策理由共用。 */
export const SCENARIO_LABELS: Readonly<Record<Scenario, string>> = Object.freeze({
  live: "實時資料",
  normal: "正常通勤",
  heavy_rain: "暴雨影響",
  disruption: "交通中斷",
});

export const SCENARIO_SHORT_LABELS: Readonly<Record<Scenario, string>> = Object.freeze({
  live: "實時",
  normal: "正常",
  heavy_rain: "暴雨",
  disruption: "中斷",
});

export const CONFIDENCE_LABELS = Object.freeze({ high: "高", medium: "中", low: "低" });

export const STATUS_LABELS: Readonly<Record<RouteStatus, string>> = Object.freeze({
  ok: "服務正常",
  delayed: "服務延誤",
  disrupted: "服務中斷",
  unknown: "狀態未確認",
});

export const CROWDING_LABELS: Readonly<Record<Crowding, string>> = Object.freeze({
  low: "人流低",
  medium: "人流一般",
  high: "人流高",
  unknown: "人流未確認",
});

export const DATA_QUALITY_LABELS = Object.freeze({
  live: "實時資料",
  cached: "快取資料",
  fixture: "演示固定資料",
});

export const DECISION_STATUS_LABELS = Object.freeze({
  ready: "已有建議",
  uncertain: "建議可用但不確定",
  unavailable: "目前無法給出建議",
});

/** 行動建議的中文標籤；`action` 是 `status` 的可執行版本。 */
export const DECISION_ACTION_LABELS: Readonly<Record<DecisionAction, string>> = Object.freeze({
  depart_now: "立即出發",
  depart_at: "按建議時間出發",
  wait: "先核實再出發",
  hold: "留在安全處持續觀察",
});
