/**
 * 風險模組的對外入口。
 *
 * 上層（決策層、API、前端）只從這裡取用風險能力，不直接深入子檔案，
 * 這樣之後要調整內部結構（例如把因子拆檔）時，對外介面不變。
 */
export * from "./thresholds";
export * from "./factors";
export { assessRouteRisk } from "./engine";
export type { AssessRiskOptions } from "./engine";
