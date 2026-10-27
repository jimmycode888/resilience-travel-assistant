/**
 * 口岸註冊表（跨境工作流的核心資料，owner：成員 B 維護資料、成員 A 維護型別）。
 *
 * 為什麼把口岸做成「香港側節點 + 深圳側節點」兩個點：
 *   跨境路段的判定必須是**結構化**的，不能靠字串比對「口岸」二字。
 *   有了兩個節點，`route/parse.ts` 就能明確判定
 *   `in_hk` → `border_crossing` → `in_sz` 的轉換邊界，
 *   成員 C 的 Border Risk 與成員 D 的地圖繪製也都直接使用這份資料。
 *
 * ⚠️ 開放時間及港方代表點已有官方來源；双側入口尚未全部核實（`coordinatesVerified: false`），
 *    成員 B 必須以官方資料核實後更新，並同步 `docs/DATA_SOURCES.md`。
 *    在核實之前，不得把這裡的數值當成官方事實對外說明。
 */
import { hkMinutesOfDay } from "@/lib/time";
import type { JourneyMode, PlaceSide } from "@/lib/types/journey";
import { distanceKm } from "./distance";

export interface PortNode {
  name: string;
  lat: number;
  lon: number;
}

export interface BorderPort {
  id: string;
  name: string;
  nameEn: string;
  /** 香港側入口節點。 */
  hkNode: PortNode;
  /** 深圳側出口節點。 */
  szNode: PortNode;
  /** 24 小時通關。 */
  alwaysOpen: boolean;
  /** 開放時間（香港時間 HH:mm）；alwaysOpen 為 true 時忽略。 */
  openFrom: string;
  openTo: string;
  /** 這個口岸可用的通行方式。 */
  modes: readonly JourneyMode[];
  /** 座標與時間是否已由成員 B 以官方資料核實。 */
  coordinatesVerified: boolean;
  note: string | null;
}

export const BORDER_PORTS: readonly BorderPort[] = Object.freeze([
  {
    id: "lok-ma-chau",
    name: "落馬洲支線口岸",
    nameEn: "Lok Ma Chau Spur Line",
    hkNode: { name: "落馬洲站", lat: 22.5145, lon: 114.0656 },
    szNode: { name: "福田口岸", lat: 22.519, lon: 114.068 },
    alwaysOpen: false,
    openFrom: "06:30",
    openTo: "22:30",
    modes: ["mtr", "walk"],
    coordinatesVerified: false,
    note: "開放時間已核對。官方管制站代表點另存port-facts；本路由入口及深圳側坐標未完整核實。東鐵線落馬洲支線；接駁深圳地鐵 4 號線福田口岸站。",
  },
  {
    id: "lo-wu",
    name: "羅湖口岸",
    nameEn: "Lo Wu",
    hkNode: { name: "羅湖站", lat: 22.53, lon: 114.113 },
    szNode: { name: "羅湖口岸", lat: 22.532, lon: 114.116 },
    alwaysOpen: false,
    openFrom: "06:30",
    openTo: "24:00",
    modes: ["mtr", "walk"],
    coordinatesVerified: false,
    note: "開放時間已核對。官方管制站代表點另存port-facts；本路由入口及深圳側坐標未完整核實。東鐵線羅湖站；接駁深圳地鐵 1 號線羅湖站。",
  },
  {
    id: "huanggang",
    name: "皇崗口岸",
    nameEn: "Huanggang",
    hkNode: { name: "落馬洲（皇崗）", lat: 22.521, lon: 114.076 },
    szNode: { name: "皇崗口岸", lat: 22.527, lon: 114.079 },
    alwaysOpen: true,
    openFrom: "00:00",
    openTo: "24:00",
    modes: ["cross_border_bus", "walk"],
    coordinatesVerified: false,
    note: "2026-10-12 新皇崗啟用。24小時開放與新港方代表點見port-facts；本節點仍是舊參考坐標，不可用於新皇崗真實導航。舊落馬洲接駁已停止。",
  },
  {
    id: "shenzhen-bay",
    name: "深圳灣口岸",
    nameEn: "Shenzhen Bay",
    hkNode: { name: "深圳灣口岸（香港側）", lat: 22.502, lon: 113.944 },
    szNode: { name: "深圳灣口岸（深圳側）", lat: 22.505, lon: 113.95 },
    alwaysOpen: false,
    openFrom: "06:30",
    openTo: "24:00",
    modes: ["cross_border_bus"],
    coordinatesVerified: false,
    note: "開放時間已核對。官方管制站代表點另存port-facts；本路由入口及深圳側坐標未完整核實。以跨境巴士為主；香港側由屯門／天水圍方向接駁。",
  },
  {
    id: "man-kam-to",
    name: "文錦渡口岸",
    nameEn: "Man Kam To",
    hkNode: { name: "文錦渡（香港側）", lat: 22.535, lon: 114.125 },
    szNode: { name: "文錦渡口岸", lat: 22.537, lon: 114.129 },
    alwaysOpen: false,
    openFrom: "07:00",
    openTo: "22:00",
    modes: ["cross_border_bus"],
    coordinatesVerified: false,
    note: "開放時間已核對。官方管制站代表點另存port-facts；本路由入口及深圳側坐標未完整核實。以跨境巴士為主，班次較疏。",
  },
  {
    id: "heung-yuen-wai",
    name: "香園圍口岸",
    nameEn: "Heung Yuen Wai (Liantang)",
    hkNode: { name: "香園圍口岸（香港側）", lat: 22.554, lon: 114.155 },
    szNode: { name: "蓮塘口岸", lat: 22.557, lon: 114.159 },
    alwaysOpen: false,
    openFrom: "07:00",
    openTo: "22:00",
    modes: ["cross_border_bus", "walk"],
    coordinatesVerified: false,
    note: "開放時間已核對。官方管制站代表點另存port-facts；本路由入口及深圳側坐標未完整核實。人車直達；接駁深圳地鐵 2 號線蓮塘站。",
  },
] satisfies BorderPort[]);

const PORT_BY_ID = new Map(BORDER_PORTS.map((port) => [port.id, port]));

export function findPort(id: string): BorderPort | undefined {
  return PORT_BY_ID.get(id);
}

export function listPorts(): readonly BorderPort[] {
  return BORDER_PORTS;
}

export function portsOnSide(side: PlaceSide): (PortNode & { portId: string; portName: string })[] {
  return BORDER_PORTS.map((port) => {
    const node = side === "hk" ? port.hkNode : port.szNode;
    return { ...node, portId: port.id, portName: port.name };
  });
}

/** 解析 `HH:mm` 為當日分鐘數；`24:00` 視為當日結束（1440）。 */
export function parseHhMm(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour === 24 && minute === 0) return 24 * 60;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatOpenHours(port: BorderPort): string {
  if (port.alwaysOpen) return "24 小時";
  return `${port.openFrom}–${port.openTo === "24:00" ? "24:00" : port.openTo}`;
}

/**
 * 這個口岸在指定時間是否開放（香港時間）。
 *
 * 為什麼重要：跨境 Plan B 的「換口岸」建議若不檢查開放時間，
 * 就會在深夜把使用者送去已關閉的落馬洲——這是產品層級的錯誤，不只是程式錯誤。
 */
export function isPortOpen(port: BorderPort, iso: string): boolean {
  if (port.alwaysOpen) return true;
  const from = parseHhMm(port.openFrom);
  const to = parseHhMm(port.openTo);
  if (from === null || to === null) return false;
  const minutes = hkMinutesOfDay(iso);
  return minutes >= from && minutes < to;
}

export function portsOpenAt(iso: string): BorderPort[] {
  return BORDER_PORTS.filter((port) => isPortOpen(port, iso));
}

/** 依行進方向取得口岸的入口節點與出口節點。 */
export function portNodes(port: BorderPort, direction: "hk_to_sz" | "sz_to_hk"): {
  from: PortNode;
  to: PortNode;
  fromSide: PlaceSide;
  toSide: PlaceSide;
} {
  if (direction === "hk_to_sz") {
    return { from: port.hkNode, to: port.szNode, fromSide: "hk", toSide: "sz" };
  }
  return { from: port.szNode, to: port.hkNode, fromSide: "sz", toSide: "hk" };
}

export interface PortNodeMatch {
  port: BorderPort;
  side: PlaceSide;
  distanceKm: number;
}

/**
 * 找出座標對應的口岸節點（含是哪一側）。
 *
 * 容差設 1.5 公里：足以涵蓋車站與口岸大樓之間的實際距離，
 * 又不會把 30 公里外的市區地點誤判成口岸。
 */
export function matchPortNode(lat: number, lon: number, toleranceKm = 1.5): PortNodeMatch | null {
  let best: PortNodeMatch | null = null;
  for (const port of BORDER_PORTS) {
    const candidates: Array<{ node: PortNode; side: PlaceSide }> = [
      { node: port.hkNode, side: "hk" },
      { node: port.szNode, side: "sz" },
    ];
    for (const { node, side } of candidates) {
      const km = distanceKm(lat, lon, node.lat, node.lon);
      if (km <= toleranceKm && (!best || km < best.distanceKm)) {
        best = { port, side, distanceKm: km };
      }
    }
  }
  return best;
}

/** 最近的口岸節點，不限距離（用於推斷未知地點位於哪一側）。 */
export function nearestPortNode(lat: number, lon: number): PortNodeMatch {
  let best: PortNodeMatch | null = null;
  for (const port of BORDER_PORTS) {
    const candidates: Array<{ node: PortNode; side: PlaceSide }> = [
      { node: port.hkNode, side: "hk" },
      { node: port.szNode, side: "sz" },
    ];
    for (const { node, side } of candidates) {
      const km = distanceKm(lat, lon, node.lat, node.lon);
      if (!best || km < best.distanceKm) best = { port, side, distanceKm: km };
    }
  }
  // BORDER_PORTS 非空，因此 best 必定存在；這裡保留明確分支以免回傳型別放寬。
  if (!best) throw new Error("口岸註冊表為空，無法判定最近口岸。");
  return best;
}

/** 找出兩個節點所屬的口岸（用於把跨境路段綁到正確的口岸）。 */
export function portBetween(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): BorderPort | null {
  const a = matchPortNode(fromLat, fromLon);
  const b = matchPortNode(toLat, toLon);
  if (a && b && a.port.id === b.port.id) return a.port;
  if (a) return a.port;
  if (b) return b.port;
  // 兩端都不在口岸容差內：用中點找最近口岸（跨境巴士直達的情況）。
  const midLat = (fromLat + toLat) / 2;
  const midLon = (fromLon + toLon) / 2;
  const nearest = nearestPortNode(midLat, midLon);
  // 中點距離口岸太遠時不硬綁，避免把普通路段誤標成跨境。
  return nearest.distanceKm <= 8 ? nearest.port : null;
}
