/**
 * 可靠性評估的門檻與罰分（成員 A 定稿）。
 *
 * 為什麼集中在這裡：與風險模型同一套紀律——門檻散落在邏輯裡就沒人能 review。
 * 這裡只放常數，任何「怎麼算」的判斷留在 engine / ranking，
 * 這樣之後要用真實資料校準信心分級時，只需要改這一個檔案。
 *
 * ⚠️ 產品倫理：`RELIABILITY_CUTOFFS` 切出來的是**定性分級**（高／中／低），
 * 不是準時機率。`ruleScore` 只是內部排序用的規則分數，不得對外顯示成百分比。
 */
import type { RouteQuality } from "@/lib/types/route";
import type { RiskLevel } from "@/lib/types/risk";

/** 內部規則分數的分級切點：>= 70 → high；>= 45 → medium；否則 low。 */
export const RELIABILITY_CUTOFFS = Object.freeze({ high: 70, medium: 45 });

/**
 * ETA 浮動分鐘數（依風險等級給出「最遲到達」的緩衝）。
 *
 * 為什麼用等級而非分數：緩衝是給使用者的行動承諾，必須保守且可解釋；
 * 直接用連續分數會讓 UI 出現「最遲 08:37:42」這種假精確。
 */
export const ETA_FLOAT_MINUTES_BY_LEVEL: Readonly<Record<RiskLevel, number>> = Object.freeze({
  low: 10,
  medium: 20,
  high: 35,
});

/** 轉乘次數 >= 2 時的可靠度罰分。 */
export const TRANSFER_PENALTY = 8;

/** 風險等級為 high 時的可靠度罰分（與風險分數本身的扣分疊加）。 */
export const HIGH_RISK_PENALTY = 10;

/** 資料品質罰分：live 不罰，cached / fixture 逐級扣，避免演示資料看起來像即時。 */
export const QUALITY_PENALTY: Readonly<Record<RouteQuality, number>> = Object.freeze({
  live: 0,
  cached: 3,
  fixture: 5,
});

/** 未校準聲明，必須與 `onTimeConfidence` 一起顯示。 */
export const CONFIDENCE_NOTE = "此為定性到達信心，不是校準過的準時機率。";
