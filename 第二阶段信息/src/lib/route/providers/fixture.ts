/**
 * 離線路線供應商（成員 A 維護）。
 *
 * 為什麼一定要有這個：本專案的硬約束是「不填任何金鑰、斷網也能完整運行」。
 * 真實路網（OSRM）拿不到時，系統仍必須給出可重現的候選路線，
 * 而且必須**如實標示 `quality: "fixture"`**，不得偽裝成實時資料。
 *
 * 三條候選路線都是跨境走廊（重點工作流）：
 *   XB-1  經落馬洲支線口岸（最快）
 *   XB-2  經羅湖口岸（Plan B）
 *   XB-3  經深圳灣口岸（24 小時，深夜時最重要的替代口岸）
 * 另有一條香港境內走廊（供非跨境查詢與境內路段判定測試）。
 *
 * ⚠️ 所有時間為演示估算值，非官方班次表；座標與口岸時間須由成員 B 核實。
 */
import { findPlace } from "@/lib/geo/places";
import { hkIsoFromMinutes } from "@/lib/time";
import type { BorderQueue } from "@/lib/types/journey";
import type { RawJourney, RawRoute, RawStep, RouteProvider, RouteQuery } from "@/lib/types/route";

/** 演示服務日與出發時間（與第一階段 fixture 慣例一致：固定值，可重現）。 */
export const FIXTURE_SERVICE_DATE = "2026-10-13";
export const FIXTURE_DEPART_MINUTES = 8 * 60; // 08:00

function at(minutes: number): string {
  return hkIsoFromMinutes(FIXTURE_SERVICE_DATE, minutes);
}

function point(idOrName: string): { name: string; lat: number; lon: number } {
  // 同時支援地點 ID 與名稱，兩者在路線定義中都會出現。
  const place = findPlace(idOrName);
  if (!place) {
    throw new Error(`fixture 路線引用了未註冊的地點：${idOrName}`);
  }
  return { name: place.name, lat: place.lat, lon: place.lon };
}

function line(a: string, b: string): [number, number][] {
  const from = point(a);
  const to = point(b);
  return [
    [from.lon, from.lat],
    [to.lon, to.lat],
  ];
}

/** 東鐵線金鐘 → 落馬洲的參考折線（沿線主要站點，供地圖繪製）。 */
const EAST_RAIL_TO_LMC: [number, number][] = [
  [114.165, 22.279], // 金鐘
  [114.182, 22.303], // 紅磡
  [114.179, 22.373], // 大圍
  [114.21, 22.413], // 大學
  [114.128, 22.502], // 上水
  [114.0656, 22.5145], // 落馬洲
];

const EAST_RAIL_TO_LOWU: [number, number][] = [
  [114.165, 22.279],
  [114.182, 22.303],
  [114.179, 22.373],
  [114.21, 22.413],
  [114.128, 22.502],
  [114.113, 22.53], // 羅湖
];

/** 過海隧道往深圳灣的參考折線。 */
const XB_BUS_TO_SHENZHEN_BAY: [number, number][] = [
  [114.165, 22.279],
  [114.12, 22.3],
  [113.99, 22.42],
  [113.944, 22.502],
];

const QUEUES: Readonly<Record<string, BorderQueue>> = Object.freeze({
  "lok-ma-chau": {
    portId: "lok-ma-chau",
    queueMinutesRange: [12, 28],
    confidence: "low",
    note: "估算：依時段規律推算，非官方即時排隊資料。",
  },
  "lo-wu": {
    portId: "lo-wu",
    queueMinutesRange: [18, 40],
    confidence: "low",
    note: "估算：依時段規律推算，非官方即時排隊資料。",
  },
  "shenzhen-bay": {
    portId: "shenzhen-bay",
    queueMinutesRange: [20, 45],
    confidence: "low",
    note: "估算：跨境巴士班次與時段規律推算，非官方即時排隊資料。",
  },
});

function step(
  mode: string,
  lineName: string | null,
  fromId: string,
  toId: string,
  durationMinutes: number,
  geometry: [number, number][],
  extra: Pick<RawStep, "viaStations" | "viaDistricts"> = {},
): RawStep {
  return {
    mode,
    line: lineName,
    from: point(fromId),
    to: point(toId),
    durationMinutes,
    geometry,
    ...extra,
  };
}

/** 中環（交易廣場）→ 深圳福田，經落馬洲支線口岸。 */
const CROSS_BORDER_VIA_LOK_MA_CHAU: RawJourney = {
  id: "xb-1-lok-ma-chau",
  label: "經落馬洲支線口岸",
  departAt: at(FIXTURE_DEPART_MINUTES),
  borderQueues: QUEUES,
  steps: [
    step("walk", null, "central-exchange-square", "central-station", 5, line("central-exchange-square", "central-station")),
    step("mtr", "港島線", "central-station", "admiralty-station", 3, line("central-station", "admiralty-station")),
    step("mtr", "東鐵線", "admiralty-station", "lok-ma-chau-station", 52, EAST_RAIL_TO_LMC, {
      viaStations: ["紅磡", "大圍", "大學", "上水"],
      viaDistricts: ["灣仔", "九龍城", "沙田", "北區"],
    }),
    step("walk", null, "lok-ma-chau-station", "futian-checkpoint", 12, line("lok-ma-chau-station", "futian-checkpoint")),
    step("mtr", "深圳地鐵 4 號線", "futian-checkpoint", "futian-station-sz", 9, line("futian-checkpoint", "futian-station-sz"), {
      viaStations: ["福民", "會展中心"],
      viaDistricts: ["福田區"],
    }),
  ],
};

/** 中環（交易廣場）→ 深圳福田，經羅湖口岸（Plan B）。 */
const CROSS_BORDER_VIA_LO_WU: RawJourney = {
  id: "xb-2-lo-wu",
  label: "經羅湖口岸",
  departAt: at(FIXTURE_DEPART_MINUTES),
  borderQueues: QUEUES,
  steps: [
    step("walk", null, "central-exchange-square", "central-station", 5, line("central-exchange-square", "central-station")),
    step("mtr", "港島線", "central-station", "admiralty-station", 3, line("central-station", "admiralty-station")),
    step("mtr", "東鐵線", "admiralty-station", "lo-wu-station-hk", 56, EAST_RAIL_TO_LOWU, {
      viaStations: ["紅磡", "大圍", "大學", "上水"],
      viaDistricts: ["灣仔", "九龍城", "沙田", "北區"],
    }),
    step("walk", null, "lo-wu-station-hk", "luohu-station-sz", 10, line("lo-wu-station-hk", "luohu-station-sz")),
    step("mtr", "深圳地鐵 1 號線", "luohu-station-sz", "convention-center", 12, line("luohu-station-sz", "convention-center"), {
      viaStations: ["國貿", "大劇院"],
      viaDistricts: ["羅湖區", "福田區"],
    }),
    step("mtr", "深圳地鐵 4 號線", "convention-center", "futian-station-sz", 5, line("convention-center", "futian-station-sz"), {
      viaDistricts: ["福田區"],
    }),
  ],
};

/** 中環（交易廣場）→ 深圳福田，經深圳灣口岸（24 小時，深夜替代）。 */
const CROSS_BORDER_VIA_SHENZHEN_BAY: RawJourney = {
  id: "xb-3-shenzhen-bay",
  label: "經深圳灣口岸（24 小時）",
  departAt: at(FIXTURE_DEPART_MINUTES),
  borderQueues: QUEUES,
  steps: [
    step("walk", null, "central-exchange-square", "central-station", 5, line("central-exchange-square", "central-station")),
    step("mtr", "港島線", "central-station", "admiralty-station", 3, line("central-station", "admiralty-station")),
    step("cross_border_bus", "跨境巴士（深圳灣線）", "admiralty-station", "shenzhen-bay-checkpoint-hk", 75, XB_BUS_TO_SHENZHEN_BAY, {
      viaDistricts: ["灣仔", "中西區", "屯門", "南山區"],
    }),
    step("walk", null, "shenzhen-bay-checkpoint-hk", "shenzhen-bay-checkpoint", 14, line("shenzhen-bay-checkpoint-hk", "shenzhen-bay-checkpoint")),
    step("bus", "深圳巴士", "shenzhen-bay-checkpoint", "futian-station-sz", 35, line("shenzhen-bay-checkpoint", "futian-station-sz"), {
      viaDistricts: ["南山區", "福田區"],
    }),
  ],
};

/** 香港境內走廊：坑口（富寧花園）→ 中環（交易廣場）。 */
const HK_HANG_HAU_TO_CENTRAL: RawJourney = {
  id: "hk-1-tko-isl",
  label: "港鐵將軍澳線 → 港島線",
  departAt: at(FIXTURE_DEPART_MINUTES),
  steps: [
    step("walk", null, "hang-hau-estate", "hang-hau-station", 5, line("hang-hau-estate", "hang-hau-station")),
    step("mtr", "將軍澳線", "hang-hau-station", "north-point-station", 19, line("hang-hau-station", "north-point-station"), {
      viaStations: ["調景嶺", "鰂魚涌"],
      viaDistricts: ["西貢區", "東區"],
    }),
    step("walk", null, "north-point-station", "north-point-station", 3, line("north-point-station", "north-point-station")),
    step("mtr", "港島線", "north-point-station", "central-station", 12, line("north-point-station", "central-station"), {
      viaStations: ["灣仔", "金鐘"],
      viaDistricts: ["東區", "灣仔", "中西區"],
    }),
  ],
};

interface Corridor {
  originIds: readonly string[];
  destinationIds: readonly string[];
  journeys: readonly RawJourney[];
}

const CORRIDORS: readonly Corridor[] = [
  {
    originIds: ["central-exchange-square", "central-station"],
    destinationIds: ["futian-station-sz", "futian-checkpoint", "convention-center", "civic-center"],
    journeys: [CROSS_BORDER_VIA_LOK_MA_CHAU, CROSS_BORDER_VIA_LO_WU, CROSS_BORDER_VIA_SHENZHEN_BAY],
  },
  {
    originIds: ["hang-hau-estate", "hang-hau-station"],
    destinationIds: ["central-exchange-square", "central-station"],
    journeys: [HK_HANG_HAU_TO_CENTRAL],
  },
];

export interface FixtureProviderOptions {
  /** 注入服務日與出發時間（測試用）；預設使用固定的演示時間。 */
  serviceDate?: string;
  departMinutes?: number;
}

/** 建立離線供應商。永遠提供 `quality: "fixture"` 的路線，且結果完全可重現。 */
export function createFixtureProvider(options: FixtureProviderOptions = {}): RouteProvider {
  const serviceDate = options.serviceDate ?? FIXTURE_SERVICE_DATE;
  const departMinutes = options.departMinutes ?? FIXTURE_DEPART_MINUTES;

  return {
    id: "fixture",
    provides: "journey",
    async fetch(query: RouteQuery, signal: AbortSignal): Promise<RawRoute[] | null> {
      if (signal.aborted) return null;

      // 查詢進来的是地點 ID（或名稱）；兩者都要能查到。
      const origin = findPlace(query.origin);
      const destination = findPlace(query.destination);
      if (!origin || !destination) return null;

      const corridor = CORRIDORS.find(
        (candidate) =>
          candidate.originIds.includes(origin.id) &&
          candidate.destinationIds.includes(destination.id),
      );
      if (!corridor) return null;

      // 指定口岸的篩選由 adapter 統一處理（它才知道候選的完整資訊）。
      return corridor.journeys.map((journey) => ({
        provider: "fixture",
        quality: "fixture",
        journey: {
          ...journey,
          departAt: hkIsoFromMinutes(serviceDate, departMinutes),
        },
        fetchedAt: hkIsoFromMinutes(serviceDate, departMinutes),
        notices: ["本路線使用演示固定資料（fixture），非實時路況。"],
      }));
    },
  };
}
