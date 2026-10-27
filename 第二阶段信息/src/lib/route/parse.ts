/**
 * 路徑解析器（成員 A 的核心模組）。
 *
 * 職責：把供應商中立格式 `RawJourney` 讀成內部 `Journey`。
 * 它是「出行／導航路徑讀取」的心臟，而且**完全獨立於供應商**：
 * 新增地圖或路線 API 時，只要先把回應轉成 `RawJourney`，這裡與上層都不用改。
 *
 * 解析器負責四件事：
 *   1. 交通方式對照（供應商字串 → 內部 `JourneyMode`）
 *   2. 跨境判定（依端點兩側標出 `in_hk` / `border_crossing` / `in_sz`）並綁定口岸
 *   3. 時間推進（由 `departAt` 起算，逐段累加）
 *   4. 幾何補齊與誠實標示（供應商沒給座標時不得假裝有）
 */
import { addMinutes, diffMinutes } from "@/lib/time";
import { portBetween, type BorderPort } from "@/lib/geo/ports";
import { resolvePlace } from "@/lib/geo/places";
import type {
  BorderQueue,
  Journey,
  JourneyMode,
  JourneySegment,
  LonLat,
  PlaceRef,
  SegmentKind,
} from "@/lib/types/journey";
import type { RawJourney, RawStep } from "@/lib/types/route";

export type RouteParseErrorCode = "EMPTY_JOURNEY" | "INVALID_STEP" | "INVALID_DEPART_AT";

export class RouteParseError extends Error {
  readonly code: RouteParseErrorCode;

  constructor(code: RouteParseErrorCode, message: string) {
    super(message);
    this.name = "RouteParseError";
    this.code = code;
  }
}

export interface ParsedJourney {
  journey: Journey;
  /** 解析過程中的誠實提示（推斷出來的一側、補出來的幾何、缺少的排隊資料…）。 */
  notices: string[];
}

/** 供應商 mode 字串 → 內部交通方式。未知字串會回報並按巴士處理。 */
const MODE_MAP: Readonly<Record<string, JourneyMode>> = Object.freeze({
  walk: "walk",
  walking: "walk",
  foot: "walk",
  pedestrian: "walk",
  mtr: "mtr",
  metro: "mtr",
  subway: "mtr",
  rail: "mtr",
  train: "mtr",
  heavy_rail: "mtr",
  light_rail: "tram",
  lrt: "tram",
  tram: "tram",
  bus: "bus",
  coach: "bus",
  citybus: "bus",
  kmb: "bus",
  // OSRM 的 driving profile 只代表「道路路徑」。本專案沒有私家車模式，
  // 道路路段一律用於巴士／跨境巴士，因此對照為 bus。
  driving: "bus",
  car: "bus",
  auto: "bus",
  road: "bus",
  minibus: "minibus",
  gmb: "minibus",
  ferry: "ferry",
  boat: "ferry",
  cross_border_bus: "cross_border_bus",
  xb: "cross_border_bus",
  hsr: "hsr",
  high_speed_rail: "hsr",
});

interface ModeMapping {
  mode: JourneyMode;
  notice: string | null;
}

export function mapMode(rawMode: string): ModeMapping {
  const key = rawMode.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const mapped = MODE_MAP[key];
  if (mapped) return { mode: mapped, notice: null };
  return {
    mode: "bus",
    notice: `「${rawMode}」是未識別的交通方式，已按巴士處理，請成員 B 確認供應商欄位。`,
  };
}

function classifyKind(from: PlaceRef, to: PlaceRef): SegmentKind {
  if (from.side === to.side) return from.side === "hk" ? "in_hk" : "in_sz";
  return "border_crossing";
}

function ensureGeometry(step: RawStep, from: PlaceRef, to: PlaceRef, notices: string[]): LonLat[] {
  const provided = step.geometry.filter(
    (point): point is LonLat => Array.isArray(point) && point.length === 2,
  );
  if (provided.length >= 2) return provided;
  notices.push(
    `「${step.from.name} → ${step.to.name}」缺少路網座標，已用起終點連線代替（地圖上為直線）。`,
  );
  return [
    [from.lon, from.lat],
    [to.lon, to.lat],
  ];
}

function resolveStepPlaces(step: RawStep, notices: string[]): { from: PlaceRef; to: PlaceRef } {
  const from = resolvePlace({ name: step.from.name, lat: step.from.lat, lon: step.from.lon });
  const to = resolvePlace({ name: step.to.name, lat: step.to.lat, lon: step.to.lon });
  if (from.sideSource === "heuristic") {
    notices.push(
      `「${from.name}」不在地點註冊表中，已依最近口岸推斷為${from.side === "hk" ? "香港" : "深圳"}側。`,
    );
  }
  if (to.sideSource === "heuristic") {
    notices.push(
      `「${to.name}」不在地點註冊表中，已依最近口岸推斷為${to.side === "hk" ? "香港" : "深圳"}側。`,
    );
  }
  return { from, to };
}

/**
 * 讀取一條路線。
 *
 * 純函式：同一份 `RawJourney` 永遠得到同一個 `Journey`（決定性，可測試）。
 */
export function parseRawJourney(raw: RawJourney): ParsedJourney {
  // 先驗證前置條件（出發時間），再驗證內容（路段），
  // 這樣錯誤碼才能指向真正的問題，而不是被後面的檢查蓋掉。
  if (Number.isNaN(Date.parse(raw.departAt))) {
    throw new RouteParseError("INVALID_DEPART_AT", `路線「${raw.label}」的出發時間無法解析：${raw.departAt}。`);
  }
  if (raw.steps.length === 0) {
    throw new RouteParseError("EMPTY_JOURNEY", `路線「${raw.label}」沒有任何路段。`);
  }

  const notices: string[] = [];
  const segments: JourneySegment[] = [];
  const borderQueues: Readonly<Record<string, BorderQueue>> = raw.borderQueues ?? {};

  let cursor = raw.departAt;
  let index = 0;

  for (const step of raw.steps) {
    index += 1;
    if (!step.from?.name || !step.to?.name) {
      throw new RouteParseError("INVALID_STEP", `路線「${raw.label}」第 ${index} 段缺少起點或終點名稱。`);
    }

    const { from, to } = resolveStepPlaces(step, notices);
    const { mode, notice } = mapMode(step.mode);
    if (notice) notices.push(`第 ${index} 段：${notice}`);

    const durationMinutes = Math.max(0, Math.round(step.durationMinutes));
    const departAt = cursor;
    const arriveAt = addMinutes(cursor, durationMinutes);
    cursor = arriveAt;

    const kind = classifyKind(from, to);
    const segment: JourneySegment = {
      id: `${raw.id}-s${index}`,
      mode,
      kind,
      line: step.line,
      from,
      to,
      departAt,
      arriveAt,
      durationMinutes,
      geometry: ensureGeometry(step, from, to, notices),
      viaStations: step.viaStations ?? [],
      viaDistricts: step.viaDistricts ?? [],
    };

    if (kind === "border_crossing") {
      const port = portBetween(from.lat, from.lon, to.lat, to.lon);
      const queue = port ? borderQueues[port.id] : undefined;
      if (queue) {
        segment.border = queue;
      } else {
        notices.push(
          port
            ? `路段「${from.name} → ${to.name}」為通關段，但沒有 ${port.name} 的排隊資料，Border Risk 將以缺少資料處理。`
            : `路段「${from.name} → ${to.name}」跨越邊界，但無法對應到已知口岸，請成員 B 核對座標。`,
        );
      }
    }

    segments.push(segment);
  }

  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) {
    throw new RouteParseError("EMPTY_JOURNEY", `路線「${raw.label}」解析後沒有任何路段。`);
  }

  const borderPortIds: string[] = [];
  for (const segment of segments) {
    if (segment.kind !== "border_crossing") continue;
    const portId = segment.border?.portId ?? portBetween(
      segment.from.lat,
      segment.from.lon,
      segment.to.lat,
      segment.to.lon,
    )?.id;
    if (portId && !borderPortIds.includes(portId)) borderPortIds.push(portId);
  }

  const journey: Journey = {
    id: raw.id,
    label: raw.label,
    segments,
    departAt: first.departAt,
    arriveAt: last.arriveAt,
    totalMinutes: diffMinutes(last.arriveAt, first.departAt),
    crossesBorder: segments.some((segment) => segment.kind === "border_crossing"),
    borderPortIds,
  };

  return { journey, notices };
}

/** 從路段取得口岸（供 Border Risk 與 UI 使用）。 */
export function segmentPort(segment: JourneySegment): BorderPort | null {
  return portBetween(segment.from.lat, segment.from.lon, segment.to.lat, segment.to.lon);
}
