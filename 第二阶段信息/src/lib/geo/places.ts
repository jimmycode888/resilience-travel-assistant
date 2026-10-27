/**
 * 地點註冊表與解析（香港 + 深圳，跨境工作流需要）。
 *
 * 第一階段只有單一走廊的 4 個節點，第二階段要支援「搜尋／地圖點選」，
 * 因此需要一個可查詢的地點表，並且**每個地點都要知道自己在邊界的哪一側**，
 * 否則 `route/parse.ts` 無法判定跨境段。
 *
 * ⚠️ 座標為近似參考值（`coordinatesVerified: false`），成員 B 需以官方資料核實。
 */
import type { PlaceKind, PlaceRef, PlaceSide } from "@/lib/types/journey";
import { distanceKm } from "./distance";
import { matchPortNode, nearestPortNode } from "./ports";

export interface PlaceEntry {
  id: string;
  name: string;
  /** 其他可被搜尋到的寫法（英文名、別名）。 */
  aliases?: readonly string[];
  lat: number;
  lon: number;
  kind: PlaceKind;
  side: PlaceSide;
  coordinatesVerified: boolean;
}

export const PLACES: readonly PlaceEntry[] = Object.freeze([
  // ── 香港側 ──────────────────────────────────────────────
  { id: "central-station", name: "中環站", aliases: ["Central", "中环站"], lat: 22.282, lon: 114.158, kind: "station", side: "hk", coordinatesVerified: false },
  { id: "central-exchange-square", name: "中環（交易廣場）", aliases: ["Exchange Square", "中环（交易广场）"], lat: 22.284, lon: 114.159, kind: "landmark", side: "hk", coordinatesVerified: false },
  { id: "admiralty-station", name: "金鐘站", aliases: ["Admiralty", "金钟站"], lat: 22.279, lon: 114.165, kind: "station", side: "hk", coordinatesVerified: false },
  { id: "hang-hau-estate", name: "坑口（富寧花園）", aliases: ["Hang Hau", "坑口（富宁花园）"], lat: 22.317, lon: 114.265, kind: "landmark", side: "hk", coordinatesVerified: false },
  { id: "hang-hau-station", name: "坑口站 A 出口", aliases: ["Hang Hau Station"], lat: 22.316, lon: 114.264, kind: "station", side: "hk", coordinatesVerified: false },
  { id: "hang-hau-north-bus", name: "坑口（北）巴士總站", aliases: ["Hang Hau North Bus Terminus"], lat: 22.318, lon: 114.269, kind: "landmark", side: "hk", coordinatesVerified: false },
  { id: "sheung-shui-station", name: "上水站", aliases: ["Sheung Shui"], lat: 22.502, lon: 114.128, kind: "station", side: "hk", coordinatesVerified: false },
  { id: "north-point-station", name: "北角站", aliases: ["North Point"], lat: 22.291, lon: 114.2, kind: "station", side: "hk", coordinatesVerified: false },
  { id: "quarry-bay-station", name: "鰂魚涌站", aliases: ["Quarry Bay", "鲗鱼涌站"], lat: 22.287, lon: 114.21, kind: "station", side: "hk", coordinatesVerified: false },
  { id: "lok-ma-chau-station", name: "落馬洲站", aliases: ["Lok Ma Chau", "落马洲站"], lat: 22.5145, lon: 114.0656, kind: "station", side: "hk", coordinatesVerified: false },
  { id: "shenzhen-bay-checkpoint-hk", name: "深圳灣口岸（香港側）", aliases: ["Shenzhen Bay Port HK Side"], lat: 22.502, lon: 113.944, kind: "port", side: "hk", coordinatesVerified: false },
  { id: "huanggang-hk", name: "落馬洲（皇崗）", aliases: ["Huanggang HK Side"], lat: 22.521, lon: 114.076, kind: "port", side: "hk", coordinatesVerified: false },
  { id: "lo-wu-station-hk", name: "羅湖站", aliases: ["Lo Wu", "罗湖站"], lat: 22.53, lon: 114.113, kind: "station", side: "hk", coordinatesVerified: false },
  { id: "university-station", name: "大學站", aliases: ["University", "大学站"], lat: 22.413, lon: 114.21, kind: "station", side: "hk", coordinatesVerified: false },

  // ── 深圳側 ──────────────────────────────────────────────
  { id: "futian-checkpoint", name: "福田口岸", aliases: ["Futian Checkpoint", "福田口岸站"], lat: 22.519, lon: 114.068, kind: "port", side: "sz", coordinatesVerified: false },
  { id: "futian-station-sz", name: "福田", aliases: ["Futian", "福田站"], lat: 22.539, lon: 114.057, kind: "station", side: "sz", coordinatesVerified: false },
  { id: "convention-center", name: "會展中心", aliases: ["Convention & Exhibition Center", "会展中心"], lat: 22.539, lon: 114.065, kind: "station", side: "sz", coordinatesVerified: false },
  { id: "civic-center", name: "市民中心", aliases: ["Civic Center", "市民中心站"], lat: 22.546, lon: 114.06, kind: "station", side: "sz", coordinatesVerified: false },
  { id: "luohu-station-sz", name: "羅湖（深圳）", aliases: ["Luohu", "罗湖"], lat: 22.533, lon: 114.118, kind: "station", side: "sz", coordinatesVerified: false },
  { id: "shenzhen-bay-checkpoint", name: "深圳灣口岸（深圳側）", aliases: ["Shenzhen Bay Port", "深圳湾口岸"], lat: 22.505, lon: 113.95, kind: "port", side: "sz", coordinatesVerified: false },
  { id: "huanggang-checkpoint", name: "皇崗口岸", aliases: ["Huanggang", "皇岗口岸"], lat: 22.527, lon: 114.079, kind: "port", side: "sz", coordinatesVerified: false },
  { id: "huaqiangbei", name: "華強北", aliases: ["Huaqiangbei", "华强北"], lat: 22.547, lon: 114.088, kind: "landmark", side: "sz", coordinatesVerified: false },
] satisfies PlaceEntry[]);

/** 名稱正規化：去空白、統一括號、英文轉小寫，讓搜尋與比對更穩定。 */
export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")");
}

const BY_ID = new Map(PLACES.map((place) => [place.id, place]));

function nameIndex(): Map<string, PlaceEntry> {
  const index = new Map<string, PlaceEntry>();
  for (const place of PLACES) {
    index.set(normalizeName(place.name), place);
    for (const alias of place.aliases ?? []) index.set(normalizeName(alias), place);
  }
  return index;
}

const BY_NAME = nameIndex();

export function findPlaceById(id: string): PlaceEntry | undefined {
  return BY_ID.get(id);
}

export function findPlaceByName(name: string): PlaceEntry | undefined {
  return BY_NAME.get(normalizeName(name));
}

/** 依 ID 或名稱查詢（前端搜尋與 API 輸入都走這個）。 */
export function findPlace(idOrName: string): PlaceEntry | undefined {
  return findPlaceById(idOrName) ?? findPlaceByName(idOrName);
}

export function listPlaces(side?: PlaceSide): readonly PlaceEntry[] {
  return side ? PLACES.filter((place) => place.side === side) : PLACES;
}

/** 前端搜尋框用：對 id / 名稱 / 別名做子字串比對。 */
export function searchPlaces(query: string, options: { side?: PlaceSide; limit?: number } = {}): PlaceEntry[] {
  const needle = normalizeName(query);
  const pool = options.side ? PLACES.filter((place) => place.side === options.side) : PLACES;
  if (needle === "") return pool.slice(0, options.limit ?? pool.length);
  const matches = pool.filter((place) => {
    if (normalizeName(place.id).includes(needle)) return true;
    if (normalizeName(place.name).includes(needle)) return true;
    return (place.aliases ?? []).some((alias) => normalizeName(alias).includes(needle));
  });
  return options.limit ? matches.slice(0, options.limit) : matches;
}

function slug(value: string): string {
  const base = normalizeName(value).replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "");
  return base === "" ? "point" : base;
}

export interface ResolvePlaceInput {
  /** 已知的地點 ID；提供時優先採用。 */
  id?: string;
  name: string;
  lat: number;
  lon: number;
}

/**
 * 把任意座標解析成 `PlaceRef`，並判定它位於哪一側。
 *
 * 判定順序（愈前面愈可信，並記錄在 `sideSource` 供上層誠實標示）：
 *   1. `registry` — 命中註冊表（ID 或名稱）
 *   2. `port`     — 命中口岸節點（1.5 公里容差）
 *   3. `registry` — 座標落在某個註冊地點 300 公尺內
 *   4. `heuristic`— 用最近口岸的一側推斷（未知地點）
 */
export function resolvePlace(input: ResolvePlaceInput): PlaceRef {
  if (input.id) {
    const byId = findPlaceById(input.id);
    if (byId) return toRef(byId, input, "registry");
  }

  const byName = findPlaceByName(input.name);
  if (byName) return toRef(byName, input, "registry");

  const portMatch = matchPortNode(input.lat, input.lon);
  if (portMatch) {
    return {
      id: `${portMatch.port.id}-${portMatch.side}-node`,
      name: input.name,
      lat: input.lat,
      lon: input.lon,
      kind: "port",
      side: portMatch.side,
      sideSource: "port",
    };
  }

  let nearest: PlaceEntry | null = null;
  let nearestKm = Number.POSITIVE_INFINITY;
  for (const place of PLACES) {
    const km = distanceKm(input.lat, input.lon, place.lat, place.lon);
    if (km < nearestKm) {
      nearest = place;
      nearestKm = km;
    }
  }
  if (nearest && nearestKm <= 0.3) {
    return {
      id: nearest.id,
      name: input.name,
      lat: input.lat,
      lon: input.lon,
      kind: nearest.kind,
      side: nearest.side,
      sideSource: "registry",
    };
  }

  const inferred = nearestPortNode(input.lat, input.lon);
  return {
    id: `${slug(input.name)}-${input.lat.toFixed(4)}-${input.lon.toFixed(4)}`,
    name: input.name,
    lat: input.lat,
    lon: input.lon,
    kind: "point",
    side: inferred.side,
    sideSource: "heuristic",
  };
}

function toRef(entry: PlaceEntry, input: ResolvePlaceInput, source: "registry" | "port"): PlaceRef {
  return {
    id: entry.id,
    name: input.name === "" ? entry.name : input.name,
    lat: entry.lat,
    lon: entry.lon,
    kind: entry.kind,
    side: entry.side,
    sideSource: source,
  };
}
