/**
 * 固定通勤走廊：將軍澳（坑口）→ 中環。
 *
 * 首版只支援這一個走廊、兩個起點、兩個終點與三條候選路線（第 4 條為中斷時的替代轉乘點，
 * 仍屬三條之一）。這是刻意的範圍限制：不做全港路線搜尋。
 *
 * ⚠️ 所有時間均為「演示估算值」，用於讓三個情景可以穩定重現；
 *    並非官方班次表。成員 B 需以官方資料替換後更新 DATA_SOURCES.md。
 */

/** 走廊節點：路線的步行段以節點為端點。 */
export const CORRIDOR_NODE_IDS = [
  "hang-hau-station",
  "hang-hau-north-bus",
  "central-station",
  "central-exchange-square",
] as const;
export type CorridorNodeId = (typeof CORRIDOR_NODE_IDS)[number];

/** 節點顯示名稱（唯一來源：決策理由、切換條件與前端都使用它）。 */
export const CORRIDOR_NODE_LABELS: Readonly<Record<CorridorNodeId, string>> = Object.freeze({
  "hang-hau-station": "坑口站 A 出口",
  "hang-hau-north-bus": "坑口（北）巴士總站",
  "central-station": "中環站",
  "central-exchange-square": "中環（交易廣場）",
});

export interface Place {
  id: string;
  name: string;
  role: "origin" | "destination";
  area: string;
  /** 此地點與走廊節點之間的步行時間（分鐘）。 */
  walkMinutes: Partial<Record<CorridorNodeId, number>>;
}

export const ORIGINS: readonly Place[] = [
  {
    id: "hang-hau-estate",
    name: "坑口（富寧花園）",
    role: "origin",
    area: "將軍澳",
    walkMinutes: { "hang-hau-station": 5, "hang-hau-north-bus": 9 },
  },
  {
    id: "hang-hau-station",
    name: "坑口站 A 出口",
    role: "origin",
    area: "將軍澳",
    walkMinutes: { "hang-hau-station": 0, "hang-hau-north-bus": 6 },
  },
] as const;

export const DESTINATIONS: readonly Place[] = [
  {
    id: "central-exchange-square",
    name: "中環（交易廣場）",
    role: "destination",
    area: "中環",
    walkMinutes: { "central-station": 6, "central-exchange-square": 0 },
  },
  {
    id: "central-ifc",
    name: "中環（國際金融中心二期）",
    role: "destination",
    area: "中環",
    walkMinutes: { "central-station": 8, "central-exchange-square": 5 },
  },
] as const;

export const CORRIDOR = {
  id: "tko-hang-hau-to-central",
  name: "將軍澳（坑口）↔ 中環",
  description:
    "固定通勤走廊：坑口一帶住宅 → 中環商業區。經港鐵將軍澳線轉港島線，或以過海巴士經東區海底隧道直達。",
  /** 首班服務時間（香港時區當日分鐘數）。早於此時間無法在限制內完成行程。 */
  serviceWindowStartMinutes: 5 * 60 + 30,
  /** 尾班服務時間，僅用於合理性檢查。 */
  serviceWindowEndMinutes: 23 * 60 + 30,
} as const;

export type SegmentMode = "walk" | "mtr" | "bus" | "minibus" | "tram" | "ferry";

export interface WalkSegment {
  kind: "walk";
  id: string;
  mode: "walk";
  /** 起點地點 ID（僅頭段使用），或走廊節點 ID。 */
  fromPlaceId: string;
  /** 終點地點 ID（僅尾段使用），或走廊節點 ID。 */
  toPlaceId: string;
  instruction: string;
}

export interface RideSegment {
  kind: "ride";
  id: string;
  mode: SegmentMode;
  line: string | null;
  from: string;
  to: string;
  rideMinutes: number;
  /** 候車時間（演示估算，非官方班距）。 */
  typicalWaitMinutes: number;
  instruction: string;
}

export interface InterchangeSegment {
  kind: "interchange";
  id: string;
  mode: "walk";
  from: string;
  to: string;
  walkMinutes: number;
  instruction: string;
}

export type RouteSegment = WalkSegment | RideSegment | InterchangeSegment;

export interface RouteDefinition {
  id: string;
  label: string;
  summary: string;
  /** 主要運輸方式，用於 Plan B 的多樣性判斷（Plan B 應對抗不同的失效模式）。 */
  primaryMode: "rail" | "road";
  segments: RouteSegment[];
  transfers: number;
  /** 相對最便宜候選路線的額外車費（HKD，演示估算，非官方票價）。 */
  extraCostHkd: number;
  /** 靜態風險提示。 */
  riskNotes: string[];
}

export const ROUTES: readonly RouteDefinition[] = [
  {
    id: "R1",
    label: "港鐵主線（將軍澳線 → 港島線）",
    summary: "坑口站上車，北角站同站轉乘港島線，中環站下車。最快但依賴鐵路班次。",
    primaryMode: "rail",
    segments: [
      {
        kind: "walk",
        id: "R1-walk-access",
        mode: "walk",
        fromPlaceId: "ORIGIN",
        toPlaceId: "hang-hau-station",
        instruction: "步行前往坑口站 A 出口",
      },
      {
        kind: "ride",
        id: "R1-ride-tko",
        mode: "mtr",
        line: "將軍澳線",
        from: "坑口站",
        to: "北角站",
        rideMinutes: 17,
        typicalWaitMinutes: 2,
        instruction: "乘將軍澳線（往北角方向）至北角站",
      },
      {
        kind: "interchange",
        id: "R1-interchange-nop",
        mode: "walk",
        from: "北角站",
        to: "北角站",
        walkMinutes: 3,
        instruction: "於北角站同站轉乘港島線（往堅尼地城方向）",
      },
      {
        kind: "ride",
        id: "R1-ride-isl",
        mode: "mtr",
        line: "港島線",
        from: "北角站",
        to: "中環站",
        rideMinutes: 10,
        typicalWaitMinutes: 2,
        instruction: "乘港島線至中環站",
      },
      {
        kind: "walk",
        id: "R1-walk-egress",
        mode: "walk",
        fromPlaceId: "central-station",
        toPlaceId: "DESTINATION",
        instruction: "由中環站出口步行前往目的地",
      },
    ],
    transfers: 1,
    extraCostHkd: 0,
    riskNotes: ["依賴將軍澳線與港島線兩個區段", "北角站轉乘通道在繁忙時間人流較多"],
  },
  {
    id: "R2",
    label: "過海巴士（東區海底隧道）",
    summary: "坑口（北）上車，經東區海底隧道直達中環，全程免轉乘，但受路面情況影響。",
    primaryMode: "road",
    segments: [
      {
        kind: "walk",
        id: "R2-walk-access",
        mode: "walk",
        fromPlaceId: "ORIGIN",
        toPlaceId: "hang-hau-north-bus",
        instruction: "步行前往坑口（北）巴士總站",
      },
      {
        kind: "ride",
        id: "R2-ride-bus",
        mode: "bus",
        line: "過海巴士（東隧）",
        from: "坑口（北）巴士總站",
        to: "中環（交易廣場）",
        rideMinutes: 44,
        typicalWaitMinutes: 9,
        instruction: "乘過海巴士經東區海底隧道至中環（交易廣場）",
      },
      {
        kind: "walk",
        id: "R2-walk-egress",
        mode: "walk",
        fromPlaceId: "central-exchange-square",
        toPlaceId: "DESTINATION",
        instruction: "步行前往目的地",
      },
    ],
    transfers: 0,
    extraCostHkd: 6,
    riskNotes: ["全程受路面擠塞影響", "班次較疏，候車時間變動大", "車費高於港鐵方案"],
  },
  {
    id: "R3",
    label: "港鐵（鰂魚涌轉乘）",
    summary: "坑口站上車，改於鰂魚涌站轉乘港島線。北角站受阻時的替代轉乘點。",
    primaryMode: "rail",
    segments: [
      {
        kind: "walk",
        id: "R3-walk-access",
        mode: "walk",
        fromPlaceId: "ORIGIN",
        toPlaceId: "hang-hau-station",
        instruction: "步行前往坑口站 A 出口",
      },
      {
        kind: "ride",
        id: "R3-ride-tko",
        mode: "mtr",
        line: "將軍澳線",
        from: "坑口站",
        to: "鰂魚涌站",
        rideMinutes: 19,
        typicalWaitMinutes: 2,
        instruction: "乘將軍澳線（往北角方向）至鰂魚涌站",
      },
      {
        kind: "interchange",
        id: "R3-interchange-qb",
        mode: "walk",
        from: "鰂魚涌站",
        to: "鰂魚涌站",
        walkMinutes: 4,
        instruction: "於鰂魚涌站轉乘港島線（往堅尼地城方向）",
      },
      {
        kind: "ride",
        id: "R3-ride-isl",
        mode: "mtr",
        line: "港島線",
        from: "鰂魚涌站",
        to: "中環站",
        rideMinutes: 13,
        typicalWaitMinutes: 2,
        instruction: "乘港島線至中環站",
      },
      {
        kind: "walk",
        id: "R3-walk-egress",
        mode: "walk",
        fromPlaceId: "central-station",
        toPlaceId: "DESTINATION",
        instruction: "由中環站出口步行前往目的地",
      },
    ],
    transfers: 1,
    extraCostHkd: 0,
    riskNotes: ["鰂魚涌站月台較窄，人流管制時轉乘時間會顯著增加", "仍然依賴將軍澳線"],
  },
] as const;

/** 以 ID 或名稱查地點（同時涵蓋起點與終點）。 */
export function findPlace(raw: string): Place | undefined {
  const value = raw.trim();
  return (
    ORIGINS.find((place) => place.id === value || place.name === value) ??
    DESTINATIONS.find((place) => place.id === value || place.name === value)
  );
}

export function findRoute(routeId: string): RouteDefinition | undefined {
  return ROUTES.find((route) => route.id === routeId);
}

export function walkMinutesFor(place: Place, nodeId: string): number | null {
  const minutes = place.walkMinutes[nodeId as CorridorNodeId];
  return typeof minutes === "number" ? minutes : null;
}

/** 路線在「無延誤」情況下的基準時間（分鐘）。 */
export function baseDurationMinutes(
  route: RouteDefinition,
  origin: Place,
  destination: Place,
): number {
  return route.segments.reduce(
    (total, segment) => total + segmentDuration(segment, origin, destination),
    0,
  );
}

export function segmentDuration(
  segment: RouteSegment,
  origin: Place,
  destination: Place,
): number {
  switch (segment.kind) {
    case "ride":
      return segment.rideMinutes + segment.typicalWaitMinutes;
    case "interchange":
      return segment.walkMinutes;
    case "walk": {
      const nodeId = segment.fromPlaceId === "ORIGIN" ? segment.toPlaceId : segment.fromPlaceId;
      const place = segment.fromPlaceId === "ORIGIN" ? origin : destination;
      const minutes = walkMinutesFor(place, nodeId);
      if (minutes === null) {
        throw new Error(
          `地點 ${place.id} 缺少節點 ${nodeId} 的步行時間；請更新 src/lib/corridor/index.ts。`,
        );
      }
      return minutes;
    }
  }
}
