/**
 * Journey / Segment — 路徑讀取的內部契約（契約所有者：成員 A）。
 *
 * 這是第二階段所有風險計算的基礎：Route Adapter 讀到的外部路線，
 * 一律先轉成 `Journey`，之後的 Risk / Reliability / Plan B 都只認這個形狀，
 * 因此更換地圖或路線供應商時，上層完全不用修改。
 *
 * 跨境是重點工作流，所以本檔案把「路段屬於哪一側」與「通關段」做成
 * 一等公民（`SegmentKind`、`JourneySegment.border`），而不是事後用字串猜。
 */
import type { TransportMode } from "./decision";

/** [lon, lat]（GeoJSON 順序）。 */
export type LonLat = [number, number];

/** 地點位於邊界的哪一側。 */
export type PlaceSide = "hk" | "sz";

export type PlaceKind = "station" | "port" | "landmark" | "address" | "point";

/**
 * 地點的判定來源。用於誠實標示：座標若來自推斷而非註冊表，
 * 上層（前端／解釋層）必須能知道，不能把推斷當成事實。
 */
export type PlaceSideSource = "registry" | "port" | "heuristic";

export interface PlaceRef {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: PlaceKind;
  side: PlaceSide;
  /** 這一側的判定依據。heuristic 表示座標不在註冊表中，已用最近口岸推斷。 */
  sideSource: PlaceSideSource;
}

/**
 * 路段的跨境歸屬。**這是解析結果，不是輸入**：
 * 由 `route/parse.ts` 依端點兩側判定，供應商不需要提供。
 */
export type SegmentKind = "in_hk" | "border_crossing" | "in_sz";

/** 第一階段 `TransportMode` 的超集（additive，不破壞既有契約）。 */
export type JourneyMode = TransportMode | "cross_border_bus" | "hsr";

/**
 * 通關段的排隊資訊。
 *
 * ⚠️ 硬約束：`queueMinutesRange` 必須是**區間**。官方公開的即時排隊資料不一定存在，
 * 因此不得退化成單點精確值，且必須附 `confidence` 與來源說明。
 */
export interface BorderQueue {
  portId: string;
  queueMinutesRange: [number, number];
  confidence: "high" | "medium" | "low";
  /** 估算依據或來源說明；估算時必須明說「估算」。 */
  note: string | null;
}

export interface JourneySegment {
  id: string;
  mode: JourneyMode;
  kind: SegmentKind;
  /** 例如 "東鐵線"；步行段為 null。 */
  line: string | null;
  from: PlaceRef;
  to: PlaceRef;
  /** ISO datetime，含 +08:00。 */
  departAt: string;
  arriveAt: string;
  durationMinutes: number;
  /** [lon, lat] 折線。至少兩點；供應商沒給時由解析器以起終點補成兩點。 */
  geometry: LonLat[];
  /** 涉及站點（供中斷／擁擠判定）。 */
  viaStations: string[];
  /** 經過區域（人類可讀）。 */
  viaDistricts: string[];
  /** 只有 `kind === "border_crossing"` 的路段會有這個欄位。 */
  border?: BorderQueue;
}

export interface Journey {
  id: string;
  label: string;
  segments: JourneySegment[];
  departAt: string;
  arriveAt: string;
  totalMinutes: number;
  crossesBorder: boolean;
  /** 依行進順序排列的口岸 ID（境內行程為空陣列）。 */
  borderPortIds: string[];
}

/** 把整條路線的折線接起來，供地圖一次畫完。 */
export function journeyGeometry(journey: Journey): LonLat[] {
  const out: LonLat[] = [];
  for (const segment of journey.segments) {
    for (const point of segment.geometry) {
      const last = out[out.length - 1];
      // 相鄰路段共用端點，去重避免地圖上出現重複頂點。
      if (!last || last[0] !== point[0] || last[1] !== point[1]) out.push(point);
    }
  }
  return out;
}

/** 取得通關段（跨境行程的關鍵路段）。 */
export function borderSegments(journey: Journey): JourneySegment[] {
  return journey.segments.filter((segment) => segment.kind === "border_crossing");
}
