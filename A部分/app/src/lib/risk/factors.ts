/**
 * 五因子風險模型的因子評分（成員 A）。
 *
 * 這裡只負責「把一項訊號變成 0–100 的分數 + 可溯源的說法」，
 * 不碰權重、不碰聚合——權重與等級切分全部集中在 `risk/thresholds.ts`。
 * 為什麼要這樣切：第一階段的教訓是「分數算法與門檻混在一起就沒人能 review」，
 * 所以本檔案只回答「這條因子有多危險」，由 `risk/engine.ts` 決定它佔多少份量。
 *
 * 兩個硬性原則：
 *   1. 每個因子都必須帶非空的 claim / evidence / source，讓 UI 上的每個結論都能回指規則。
 *   2. 缺資料時**如實降級**（較低 confidence + notices），不編造也不靜默當成 0。
 *      缺資料一律往「保守」的方向給分，因為低估風險對使用者的傷害遠大於高估。
 */
import { addMinutes } from "@/lib/time";
import { findPort, isPortOpen } from "@/lib/geo/ports";
import type { Confidence } from "@/lib/types/decision";
import type { Journey } from "@/lib/types/journey";
import type { RouteQuality } from "@/lib/types/route";
import type {
  BorderSignal,
  CrowdSignal,
  RiskIncident,
  RiskService,
  RiskWeather,
} from "@/lib/types/risk";
import { capConfidence } from "./thresholds";

/** 單一因子的評分結果（引擎會加上 weight 與 contribution 後組成 RiskFactor）。 */
export interface FactorScore {
  /** 0–100，越高越危險。 */
  score: number;
  confidence: Confidence;
  /** 人類可讀結論。 */
  claim: string;
  /** 具體證據 / 規則條款。 */
  evidence: string;
  /** 來源名稱。 */
  source: string;
  sourceUrl: string | null;
  /** 誠實提示（缺資料、降級…）。 */
  notices: string[];
}

/** 分數一律夾在 0–100，避免任何加成把分數推出值域。 */
function clampScore(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

// ─────────────────────────────────────────────────────────────
// weather（RISK_ENGINE.md §3.1）
// ─────────────────────────────────────────────────────────────

const WEATHER_LABELS: Readonly<Record<RiskWeather["condition"], string>> = Object.freeze({
  clear: "晴朗",
  cloudy: "多雲",
  rain: "有雨",
  heavy_rain: "大雨",
  storm: "暴風雨",
});

const WEATHER_BASE: Readonly<Record<RiskWeather["condition"], number>> = Object.freeze({
  clear: 0,
  cloudy: 5,
  rain: 30,
  heavy_rain: 70,
  storm: 90,
});

/**
 * 警告字串的加成。
 *
 * 為什麼用「包含」而不是精確比對：天文台的警告名稱會帶方向與後綴
 * （例如「八號東北烈風或暴風信號」「黑色暴雨警告信號」），
 * 精確比對會漏掉，反而讓最惡劣的天氣拿到最低分。多重警告同時命中時加成累加，最後再夾上限。
 */
function weatherWarningBonus(warning: string): number {
  let bonus = 0;
  if (warning.includes("黑")) bonus += 20;
  if (warning.includes("紅")) bonus += 15;
  if (warning.includes("八號") || warning.includes("九號") || warning.includes("十號")) bonus += 20;
  if (warning.includes("黃")) bonus += 5;
  return bonus;
}

export function scoreWeather(
  weather: RiskWeather | null | undefined,
  quality: RouteQuality,
): FactorScore {
  const source = "香港天文台";
  if (!weather) {
    return {
      score: 45,
      confidence: "low",
      claim: "缺少天氣資料，已按保守假設處理。",
      evidence: "RISK_ENGINE.md §3.1：缺少天氣資料時的保守處理。",
      source,
      sourceUrl: null,
      notices: ["缺少天氣資料，已按保守假設處理。"],
    };
  }

  const base = WEATHER_BASE[weather.condition];
  const bonus = weather.warning ? weatherWarningBonus(weather.warning) : 0;
  const label = WEATHER_LABELS[weather.condition];
  const claim = weather.warning
    ? `天氣條件為「${label}」，並有「${weather.warning}」`
    : `天氣條件為「${label}」`;
  const evidence = weather.warning
    ? `RISK_ENGINE.md §3.1：天氣條件 ${weather.condition} 加上警告加成；警告「${weather.warning}」。`
    : `RISK_ENGINE.md §3.1：天氣條件 ${weather.condition}，無警告。`;

  return {
    score: clampScore(base + bonus),
    confidence: capConfidence("high", quality),
    claim,
    evidence,
    source,
    sourceUrl: null,
    notices: [],
  };
}

// ─────────────────────────────────────────────────────────────
// crowd（RISK_ENGINE.md §3.4）
// ─────────────────────────────────────────────────────────────

const CROWD_LABELS: Readonly<Record<CrowdSignal["level"], string>> = Object.freeze({
  low: "低",
  medium: "中",
  high: "高",
  critical: "極高",
});

const CROWD_SCORES: Readonly<Record<CrowdSignal["level"], number>> = Object.freeze({
  low: 15,
  medium: 50,
  high: 80,
  critical: 95,
});

const CROWDING_LABELS: Readonly<Record<RiskService["crowding"], string>> = Object.freeze({
  low: "低",
  medium: "中",
  high: "高",
  unknown: "未知",
});

const CROWDING_SCORES: Readonly<Record<RiskService["crowding"], number>> = Object.freeze({
  low: 20,
  medium: 55,
  high: 85,
  unknown: 50,
});

export function scoreCrowd(
  crowd: CrowdSignal | null | undefined,
  service: RiskService | null | undefined,
  quality: RouteQuality,
): FactorScore {
  // 首選成員 C 的人流模型；它帶自己的 confidence 與 evidence，直接沿用。
  if (crowd) {
    return {
      score: CROWD_SCORES[crowd.level],
      confidence: capConfidence(crowd.confidence, quality),
      claim: `人流風險等級為「${CROWD_LABELS[crowd.level]}」`,
      evidence: crowd.evidence,
      source: "人流風險模型（成員 C）",
      sourceUrl: null,
      notices: [],
    };
  }

  // 退而求其次：服務擁擠度是同一批人流的代理訊號，但必須明說它是代替品。
  if (service) {
    return {
      score: CROWDING_SCORES[service.crowding],
      confidence: capConfidence("medium", quality),
      claim: `未接入人流模型，以服務擁擠度「${CROWDING_LABELS[service.crowding]}」代替。`,
      evidence: "RISK_ENGINE.md §3.4：以服務擁擠度作為人流替代訊號。",
      source: "港鐵服務狀態",
      sourceUrl: null,
      notices: ["未接入人流模型，以服務擁擠度代替。"],
    };
  }

  return {
    score: 50,
    confidence: "low",
    claim: "缺少人流資料，已按保守中值處理。",
    evidence: "RISK_ENGINE.md §3.4：人流因子缺少輸入時的保守處理。",
    source: "港鐵服務狀態",
    sourceUrl: null,
    notices: ["缺少人流資料，已按保守中值處理。"],
  };
}

// ─────────────────────────────────────────────────────────────
// disruption（RISK_ENGINE.md §3.2）
// ─────────────────────────────────────────────────────────────

const SERVICE_LABELS: Readonly<Record<RiskService["status"], string>> = Object.freeze({
  ok: "正常",
  delayed: "延誤",
  disrupted: "服務中斷",
  unknown: "狀態不明",
});

/**
 * 這條交通事件是否與本行程相關。
 *
 * 為什麼 `affects` 為空時視為「影響全部」：事件若沒標受影響範圍，
 * 我們無從證明它不影響本行程；在風險情境下，寧可高估也不要漏報。
 */
function incidentRelevant(incident: RiskIncident, journey: Journey): boolean {
  const affects = incident.affects;
  if (!affects || affects.length === 0) return true;
  for (const segment of journey.segments) {
    const haystack = [
      ...segment.viaStations,
      ...segment.viaDistricts,
      segment.from.name,
      segment.to.name,
    ];
    for (const place of affects) {
      if (haystack.includes(place)) return true;
    }
  }
  return false;
}

export function scoreDisruption(
  service: RiskService | null | undefined,
  incidents: readonly RiskIncident[],
  journey: Journey,
  quality: RouteQuality,
): FactorScore {
  const notices: string[] = [];
  const claimParts: string[] = [];
  let score: number;
  let confidence: Confidence;

  if (!service) {
    score = 40;
    confidence = "low";
    notices.push("缺少服務狀態資料，已按保守假設處理。");
    claimParts.push("缺少服務狀態資料，已按保守假設處理");
  } else {
    if (service.status === "ok") {
      score = 0;
    } else if (service.status === "delayed") {
      // 每延誤 1 分鐘 4 分，但延誤本身再久也不該單獨等同「服務中斷」，故封頂 60。
      score = Math.min(60, service.delayMinutes * 4);
    } else if (service.status === "disrupted") {
      score = 100;
    } else {
      score = 40;
    }
    confidence = service.status === "unknown" ? "low" : capConfidence("high", quality);

    let base = `服務狀態為「${SERVICE_LABELS[service.status]}」`;
    if (service.status === "delayed" && service.delayMinutes > 0) {
      base += `，延誤約 ${service.delayMinutes} 分鐘`;
    }
    claimParts.push(base);
  }

  let relevantCount = 0;
  for (const incident of incidents) {
    if (!incidentRelevant(incident, journey)) continue;
    relevantCount += 1;
    score += 20;
  }
  if (relevantCount > 0) {
    claimParts.push(`另有 ${relevantCount} 條與本行程相關的交通事件`);
  }

  // 跨境升級：鐵路中斷會把旅客擠到口岸，通關壓力連帶升高，因此中斷分數再上調。
  if (journey.crossesBorder && score > 0) {
    score += 10;
    notices.push("跨境行程：鐵路中斷會擠壓口岸，服務中斷風險已上調。");
    claimParts.push("跨境行程已上調風險");
  }

  const evidence = `RISK_ENGINE.md §3.2：服務狀態基準分與相關事件加成；相關事件 ${relevantCount} 條。`;

  return {
    score: clampScore(score),
    confidence,
    claim: `${claimParts.join("；")}。`,
    evidence,
    source: "運輸署特別交通消息 / 港鐵服務狀態",
    sourceUrl: null,
    notices,
  };
}

// ─────────────────────────────────────────────────────────────
// transfer（RISK_ENGINE.md §3.3）
// ─────────────────────────────────────────────────────────────

export function scoreTransfer(journey: Journey): FactorScore {
  const rideSegments = journey.segments.filter((segment) => segment.mode !== "walk").length;
  const transfers = Math.max(0, rideSegments - 1);

  return {
    score: Math.min(100, transfers * 25),
    // 轉乘次數純由路線結構決定，不依賴外部資料品質，因此這裡不壓低可信度；
    // 資料品質對可信度的上限由 engine 在彙總層統一處理，避免兩處各降一次。
    confidence: "high",
    claim: transfers === 0 ? "全程免轉乘" : `需轉乘 ${transfers} 次`,
    evidence: "RISK_ENGINE.md §3.3：以非步行段數推算轉乘次數。",
    source: "RISK_ENGINE.md §3.3",
    sourceUrl: null,
    notices: [],
  };
}

// ─────────────────────────────────────────────────────────────
// border（RISK_ENGINE.md §3.5）
// ─────────────────────────────────────────────────────────────

export function scoreBorder(
  journey: Journey,
  border: BorderSignal | null | undefined,
  quality: RouteQuality,
): FactorScore {
  const source = "口岸排隊估算（歷史時段模型）";

  if (!journey.crossesBorder) {
    return {
      score: 0,
      confidence: "high",
      claim: "境內行程，不計通關風險。",
      evidence: "RISK_ENGINE.md §3.5：境內行程不計通關因子。",
      source,
      sourceUrl: null,
      notices: [],
    };
  }

  const crossing = journey.segments.find((segment) => segment.kind === "border_crossing");
  const notices: string[] = [];

  // 成員 C 的通關訊號是**按口岸**輸出的（可能同時給落馬洲與羅湖），
  // 若注入訊號的口岸與本行程不符就直接採用，會把別的口岸的排隊時間套到這條候選上。
  // 因此先比對口岸：只有相符（或本行程無從判定口岸）時才採用注入訊號，否則回退行程自身的排隊資料。
  const journeyPortId = crossing?.border?.portId ?? journey.borderPortIds[0] ?? null;
  let signal: BorderSignal | undefined = crossing?.border;
  if (border) {
    if (journeyPortId === null || border.portId === journeyPortId) {
      signal = border;
    } else {
      notices.push(
        `注入的通關訊號口岸（${border.portId}）與本行程口岸（${journeyPortId}）不符，已改用本行程的口岸排隊資料。`,
      );
      // signal 維持 crossing?.border；若它也缺失，會落到下面的缺資料保守分支。
    }
  }

  if (!signal) {
    return {
      score: 60,
      confidence: "low",
      claim: "缺少通關排隊資料，已按保守假設處理。",
      evidence: "RISK_ENGINE.md §3.5：缺少排隊資料時的保守處理。",
      source,
      sourceUrl: null,
      // 保留前面可能已累積的「口岸不符」提示，讓使用者知道為何沒採用注入訊號。
      notices: [...notices, "缺少通關排隊資料，已按保守假設處理。"],
    };
  }

  const [minMinutes, maxMinutes] = signal.queueMinutesRange;
  let score = Math.min(100, Math.round(maxMinutes * 2));
  let confidence: Confidence = capConfidence(signal.confidence, quality);
  const claim = `口岸排隊約 ${minMinutes}–${maxMinutes} 分鐘（估算）`;
  const evidence = signal.note ?? "口岸排隊區間（估算）";

  // 口岸未開放的方案根本不可行，這是產品層級的錯誤而非單純分數問題，因此直接拉到滿分並降到 low。
  const port = findPort(signal.portId);
  if (port && (!isPortOpen(port, crossing?.departAt ?? journey.departAt) || !isPortOpen(port, addMinutes(crossing?.arriveAt ?? journey.arriveAt, maxMinutes)))) {
    score = 100;
    confidence = "low";
    notices.push("口岸在預計通關時段未開放，不可作為可行方案。");
  }

  return { score, confidence, claim, evidence, source, sourceUrl: null, notices };
}
