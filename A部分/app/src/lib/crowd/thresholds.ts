/**
 * 擁擠風險（Crowd Risk）的權重與門檻（成員 C）。
 *
 * 與風險引擎同樣的理由：把門檻與權重集中一處，方便 review 與日後校準。
 * ⚠️ 全部是**演示設定**，未經歷史客流校準；因此模型只輸出等級，不輸出人數。
 */
import type { Confidence } from "@/lib/types/decision";

/** 加權規則的單項配分（0–100 制）。 */
export const CROWD_RULES = Object.freeze({
  base: 0,
  /** 大型換乘站（例：金鐘、北角）本身的人流基線。 */
  majorInterchange: 25,
  /** 工作日晚高峰（07:30–09:30 / 17:00–19:30）。 */
  weekdayPeak: 30,
  /** 週末假日的非通勤高峰（11:00–20:00）。 */
  weekendBusy: 15,
  /** 周邊辦公樓密度。 */
  officeHigh: 20,
  officeMedium: 10,
  /** 港鐵已知輕微以上延誤（≥ 10 分鐘）造成的月台積壓。 */
  delayed: 10,
  /** 跨境行程（口岸／邊境站人流）。 */
  crossBorder: 10,
});

/** 分數 → 等級切分（高於門檻即達該級）。 */
export const CROWD_LEVEL_CUTOFFS = Object.freeze({
  medium: 35,
  high: 60,
  critical: 80,
});

/** 等級 → 對外可顯示的分數（供 A 的風險引擎取用，維持跨模組一致）。 */
export const CROWD_LEVEL_SCORES = Object.freeze({
  low: 15,
  medium: 50,
  high: 80,
  critical: 95,
});

/** 資料品質對可信度的上限：fixture 一律只能「低」。 */
export const CROWD_QUALITY_CONFIDENCE_CAP: Readonly<Record<"live" | "cached" | "fixture", Confidence>> =
  Object.freeze({ live: "medium", cached: "low", fixture: "low" });

/** 未校準聲明；任何顯示擁擠結論的地方都必須帶著它。 */
export const CROWD_UNCALIBRATED_NOTE =
  "擁擠等級由固定時段與場所規則推得，未使用歷史客流或即時人數，也未經校準；不得當成人數或機率。";
