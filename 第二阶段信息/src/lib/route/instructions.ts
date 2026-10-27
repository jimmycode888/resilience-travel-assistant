/**
 * 分步指示生成（成員 A 維護）。
 *
 * 遷移來源：CampusMapApp（嶺南大學校園地圖）的 `src/routing/providers/osrm.js`，
 * 原本是 IIFE 內的 `instructionFor()` / `compass()` / `turnWord()` / `streetSuffix()`，
 * 這裡改寫為純函式 + TypeScript，並補上測試（原專案沒有任何測試）。
 *
 * 兩層用途：
 *   1. `describeSegment()`／`describeJourney()` —— 用我們自己的 `Journey` 產生中文分步指示，
 *      給結果頁與時間軸直接顯示（我們的 `JourneySegment` 本身不帶文案）。
 *   2. `describeManeuver()` —— 當供應商提供轉向資訊（例如 OSRM 的 `maneuver`）時，
 *      產生「左轉／稍向右／抵達目的地」這類步行指示。
 *
 * 硬約束：
 *   - 只描述**已存在的事實**（路段、時間、口岸排隊區間），不推測路況。
 *   - 排隊時間一律是區間 + 置信度，且明說「估算」。
 */
import { findPort } from "@/lib/geo/ports";
import { segmentPort } from "@/lib/route/parse";
import type { Journey, JourneyMode, JourneySegment, SegmentKind } from "@/lib/types/journey";

export type Language = "zh" | "en";

const COMPASS_ZH = ["北", "東北", "東", "東南", "南", "西南", "西", "西北"] as const;
const COMPASS_EN = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
] as const;

/** 方位索引（0 = 北，順時針每 45 度一格）。 */
export function compassIndex(bearing: number): number {
  const normalized = ((bearing % 360) + 360) % 360;
  return Math.round(normalized / 45) % 8;
}

export function compassLabel(bearing: number, lang: Language = "zh"): string {
  const index = compassIndex(bearing);
  const table = lang === "zh" ? COMPASS_ZH : COMPASS_EN;
  return table[index] ?? table[0] ?? "";
}

const TURN_ZH: Readonly<Record<string, string>> = Object.freeze({
  left: "左轉",
  right: "右轉",
  straight: "直行",
  "slight left": "稍向左",
  "slight right": "稍向右",
  "sharp left": "向左急轉",
  "sharp right": "向右急轉",
  uturn: "掉頭",
});

const TURN_EN: Readonly<Record<string, string>> = Object.freeze({
  left: "turn left",
  right: "turn right",
  straight: "continue straight",
  "slight left": "bear left",
  "slight right": "bear right",
  "sharp left": "make a sharp left",
  "sharp right": "make a sharp right",
  uturn: "make a U-turn",
});

export function turnWord(modifier: string | undefined, lang: Language = "zh"): string {
  const key = (modifier ?? "straight").trim().toLowerCase();
  const table = lang === "zh" ? TURN_ZH : TURN_EN;
  return table[key] ?? (lang === "zh" ? "繼續前行" : "continue");
}

/** 供應商提供的轉向資訊（例如 OSRM step 的 `maneuver`）。 */
export interface Maneuver {
  /** `depart` / `arrive` / `turn` / `continue` / `new name` / `merge` … */
  type?: string;
  modifier?: string;
  /** 出發時的初始方位角。 */
  bearingAfter?: number;
}

export interface ManeuverContext {
  streetName?: string | null;
  lang?: Language;
}

/** 把一個轉向動作翻成可顯示的指示。 */
export function describeManeuver(maneuver: Maneuver, context: ManeuverContext = {}): string {
  const lang = context.lang ?? "zh";
  const type = (maneuver.type ?? "continue").trim().toLowerCase();
  const modifier = maneuver.modifier;
  const street = context.streetName?.trim() ?? "";

  if (type === "depart") {
    const direction =
      typeof maneuver.bearingAfter === "number" ? compassLabel(maneuver.bearingAfter, lang) : "";
    if (lang === "zh") {
      const dir = direction ? `，向${direction}` : "";
      const road = street ? `沿 ${street}` : "";
      return `開始步行${dir}${road}前行`;
    }
    return `Start walking${direction ? ` ${direction}` : ""}${street ? ` on ${street}` : ""}`;
  }

  if (type === "arrive") {
    const side =
      modifier === "left"
        ? lang === "zh"
          ? "，目的地在左側"
          : " on your left"
        : modifier === "right"
          ? lang === "zh"
            ? "，目的地在右側"
            : " on your right"
          : "";
    return lang === "zh" ? `抵達目的地${side}` : `Arrive at the destination${side}`;
  }

  const turn = turnWord(modifier, lang);
  if (lang === "zh") {
    return street ? `${turn}，進入 ${street}` : turn;
  }
  return street ? `${turn} onto ${street}` : turn;
}

const MODE_LABEL: Readonly<Record<JourneyMode, string>> = Object.freeze({
  walk: "步行",
  mtr: "港鐵",
  tram: "輕鐵／電車",
  bus: "巴士",
  minibus: "小巴",
  ferry: "渡輪",
  cross_border_bus: "跨境巴士",
  hsr: "高速鐵路",
});

const CONFIDENCE_LABEL: Readonly<Record<"high" | "medium" | "low", string>> = Object.freeze({
  high: "高",
  medium: "中",
  low: "低",
});

/** 通關段的說明：一定要帶「估算」與置信度。 */
function describeBorder(segment: JourneySegment): string {
  const portName =
    (segment.border?.portId ? findPort(segment.border.portId)?.name : undefined) ??
    segmentPort(segment)?.name ??
    "口岸";
  const queue = segment.border;
  if (!queue) {
    return `經 ${portName} 通關（排隊時間暫無資料）`;
  }
  const [min, max] = queue.queueMinutesRange;
  return `經 ${portName} 通關（預計排隊 ${min}–${max} 分鐘，估算，置信度${CONFIDENCE_LABEL[queue.confidence]}）`;
}

/**
 * 描述單一路段。不含方位推測，只描述路段本身。
 */
export function describeSegment(segment: JourneySegment): string {
  if (segment.kind === "border_crossing") {
    return describeBorder(segment);
  }

  const minutes = `（${segment.durationMinutes} 分鐘）`;

  if (segment.mode === "walk") {
    return `步行前往 ${segment.to.name}${minutes}`;
  }

  const label = segment.line ?? MODE_LABEL[segment.mode];
  return `乘 ${label} 至 ${segment.to.name}${minutes}`;
}

export interface SegmentInstruction {
  /** 由 1 起算，供 UI 顯示「第 N 步」。 */
  index: number;
  segmentId: string;
  kind: SegmentKind;
  mode: JourneyMode;
  departAt: string;
  arriveAt: string;
  durationMinutes: number;
  text: string;
  /** 這一段是否為轉乘（與前一段的線路不同）。 */
  isTransfer: boolean;
}

/**
 * 產生整條路線的分步指示。
 *
 * 轉乘判定：相鄰兩段都是同一種軌道／巴士方式但**線路名稱不同**時，標記為轉乘。
 */
export function describeJourney(journey: Journey): SegmentInstruction[] {
  return journey.segments.map((segment, index) => {
    const previous = index > 0 ? journey.segments[index - 1] : undefined;
    const isTransfer =
      previous !== undefined &&
      previous.kind !== "border_crossing" &&
      segment.kind !== "border_crossing" &&
      previous.mode === segment.mode &&
      previous.line !== segment.line;

    return {
      index: index + 1,
      segmentId: segment.id,
      kind: segment.kind,
      mode: segment.mode,
      departAt: segment.departAt,
      arriveAt: segment.arriveAt,
      durationMinutes: segment.durationMinutes,
      text: describeSegment(segment),
      isTransfer,
    };
  });
}

/** 給結果頁用的一行摘要，例如「步行 → 港鐵 → 跨境通關 → 港鐵」。 */
export function describeModes(journey: Journey): string {
  return journey.segments
    .map((segment) => (segment.kind === "border_crossing" ? "跨境通關" : MODE_LABEL[segment.mode]))
    .join(" → ");
}
