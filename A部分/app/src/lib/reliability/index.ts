/**
 * 可靠性模組的公開入口。
 *
 * 上層（決策層 / UI）只需要從這裡 import，模組內部的檔案配置可以自由調整，
 * 不會波及呼叫端。
 */
export * from "./thresholds";
export { assessReliability } from "./engine";
export type { ReliabilityOptions } from "./engine";
export { rankCandidates, rankRoutes } from "./ranking";
export type { RankingOptions } from "./ranking";
