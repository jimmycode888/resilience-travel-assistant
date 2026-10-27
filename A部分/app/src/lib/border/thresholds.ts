/**
 * 通關風險（Border Risk）的等級門檻與文案（成員 C）。
 *
 * ⚠️ 排隊「區間」本身由成員 B 的權威模型估算
 *    （`@/lib/adapters/port-conditions` 的 `estimateBorderQueue()`）。
 *    C **不再自帶一份基礎區間／加成常數** —— 這正是第二階段進度匯報列出的 C 缺口：
 *    「C 的 `BORDER_QUEUE_BASE` 與 B 的估算模型重複且數值不一致」。
 *    此檔只保留 C 自己的**風險等級切分**與免責文案，兩者都與排隊估算正交。
 *
 * 純常數，無副作用；不得作為排隊時間的來源。
 */

export type BorderDirection = "hk_to_sz" | "sz_to_hk";

/** 排隊上界（分鐘）→ 風險等級切分（C 的風險語意）。 */
export const BORDER_LEVEL_CUTOFFS = Object.freeze({ medium: 15, high: 30 });

export const BORDER_UNCALIBRATED_NOTE =
  "排隊時間為時段規則估算的區間，非實測或官方即時數字，且未經歷史校準。";
