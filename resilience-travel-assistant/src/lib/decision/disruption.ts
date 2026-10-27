/**
 * 中斷區段重疊（成員 C）—— 回應 B `B_COLLABORATION_REVIEW.md` 的 P0：
 *
 * > 「R1 將軍澳線坑口—北角中斷，R3 經鰂魚涌仍作 Plan B；兩路線共享坑口—鰂魚涌區段。
 * >   請 C 按受影響區段過濾。」
 *
 * 純函式、確定性、不讀時鐘、不呼叫網路。
 *
 * ## 為什麼需要結構化資料
 *
 * `RouteServiceStatus.affectedSegments` 目前是人類可讀字串（例如「坑口站 → 北角站」），
 * 不足以可靠判斷「另一條路線的區段是否被它覆蓋」。因此本模組只在使用者（成員 A/B）
 * 提供**結構化中斷範圍**時才生效；沒有提供時行為完全不變（不會誤刪路線，黃金輸出不受影響）。
 *
 * 建議的 additive 契約欄位（見 `DECISION_CONTRACT_CHANGE_REQUEST.md`）：
 *
 * ```ts
 * affectedLineSegments?: Array<
 *   | { kind: "line"; line: string; from: string; to: string }        // 某線某段停運
 *   | { kind: "station"; station: string; impact: "interchange" | "service" }
 * >;
 * ```
 *
 * - `kind: "line"`：該線「from → to」之間列車服務停運 → 任何使用同一線、且區段被完全
 *   覆蓋的路線都不可用（例如 R1 坑口→北角停運 → R3 的坑口→鰂魚涌同樣不可用）。
 * - `kind: "station"` / `impact: "interchange"`：只有「在該站轉乘」受阻（列車仍行駛）→
 *   只有需要在該站轉乘的路線不可用（例如北角站轉乘通道受阻 → R1 不可用，R3 仍可用）。
 */
import type { RouteDefinition, RouteSegment } from "@/lib/corridor";
import type { RouteServiceStatus } from "@/lib/types";

/** 站序來源：`docs/data/official-rail-reference.json`（成員 B 的官方靜態參考，2026-10-07）。 */
export const LINE_STATION_ORDER: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // 將軍澳線：寶琳 ↔ 北角（列車的方向以相對順序為準，本模組不分方向）。
  將軍澳線: ["寶琳", "坑口", "將軍澳", "調景嶺", "油塘", "鰂魚涌", "北角"],
  // 港島線：本走廊只用到中環、北角、鰂魚涌；順序取自官方站序（堅尼地城→柴灣方向）。
  港島線: ["堅尼地城", "中環", "北角", "鰂魚涌"],
});

export interface LineScope {
  kind: "line";
  line: string;
  from: string;
  to: string;
}

export interface StationScope {
  kind: "station";
  station: string;
  impact: "interchange" | "service";
}

export type DisruptionScope = LineScope | StationScope;

type RouteServiceStatusWithScopes = RouteServiceStatus & { affectedLineSegments?: unknown };

/** 移除「站」後綴，讓「坑口站」與「坑口」視為同一站。 */
export function normalizeStation(name: string): string {
  return name.trim().replace(/站$/, "");
}

function isLineScope(value: unknown): value is LineScope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<LineScope>;
  return (
    candidate.kind === "line" &&
    typeof candidate.line === "string" &&
    typeof candidate.from === "string" &&
    typeof candidate.to === "string" &&
    candidate.line.trim() !== "" &&
    candidate.from.trim() !== "" &&
    candidate.to.trim() !== ""
  );
}

function isStationScope(value: unknown): value is StationScope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<StationScope>;
  return (
    candidate.kind === "station" &&
    typeof candidate.station === "string" &&
    candidate.station.trim() !== "" &&
    (candidate.impact === "interchange" || candidate.impact === "service")
  );
}

/**
 * 讀取路線服務狀態上的結構化中斷範圍。
 * 欄位不存在或格式不符時回傳 `[]`（保守：不作用，維持現行行為）。
 */
export function readDisruptionScopes(service: RouteServiceStatus): DisruptionScope[] {
  const raw = (service as RouteServiceStatusWithScopes).affectedLineSegments;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is DisruptionScope => isLineScope(entry) || isStationScope(entry));
}

function stationIndex(line: string, station: string): number {
  const order = LINE_STATION_ORDER[line];
  if (!order) return -1;
  return order.indexOf(normalizeStation(station));
}

/**
 * `inner` 區段是否被同一條線的 `outer` 區段完全覆蓋（不分方向）。
 * 站序未知時退回「端點完全相同」的精確比對，避免誤判。
 */
export function segmentContains(
  line: string,
  outer: { from: string; to: string },
  inner: { from: string; to: string },
): boolean {
  const outerFrom = stationIndex(line, outer.from);
  const outerTo = stationIndex(line, outer.to);
  const innerFrom = stationIndex(line, inner.from);
  const innerTo = stationIndex(line, inner.to);

  if (outerFrom < 0 || outerTo < 0 || innerFrom < 0 || innerTo < 0) {
    return (
      normalizeStation(outer.from) === normalizeStation(inner.from) &&
      normalizeStation(outer.to) === normalizeStation(inner.to)
    );
  }

  const low = Math.min(outerFrom, outerTo);
  const high = Math.max(outerFrom, outerTo);
  return innerFrom >= low && innerFrom <= high && innerTo >= low && innerTo <= high;
}

function rideSegmentHitsLine(segment: RouteSegment, scope: LineScope): boolean {
  if (segment.kind !== "ride" || segment.line === null) return false;
  if (segment.line !== scope.line) return false;
  return segmentContains(scope.line, { from: scope.from, to: scope.to }, { from: segment.from, to: segment.to });
}

function segmentTouchesStation(segment: RouteSegment, station: string): boolean {
  if (segment.kind === "walk") return false;
  return normalizeStation(segment.from) === station || normalizeStation(segment.to) === station;
}

/** 這條路線是否落在某個中斷範圍內。 */
export function routeHitsScope(definition: RouteDefinition, scope: DisruptionScope): boolean {
  if (scope.kind === "line") {
    return definition.segments.some((segment) => rideSegmentHitsLine(segment, scope));
  }

  const station = normalizeStation(scope.station);
  if (scope.impact === "interchange") {
    return definition.segments.some(
      (segment) => segment.kind === "interchange" && segmentTouchesStation(segment, station),
    );
  }
  return definition.segments.some((segment) => segmentTouchesStation(segment, station));
}

export interface OverlapHit {
  /** 被判定同樣不可用的候選路線。 */
  routeId: string;
  /** 造成重疊的中斷路線 ID。 */
  disruptedRouteId: string;
  /** 觸發的範圍（人類可讀）。 */
  reason: string;
}

function describeScope(scope: DisruptionScope): string {
  return scope.kind === "line"
    ? `${scope.line}（${scope.from} → ${scope.to}）`
    : `${scope.station}（${scope.impact === "interchange" ? "轉乘受阻" : "車站服務受阻"}）`;
}

/**
 * 找出「因為與中斷路線的範圍重疊而同樣不可用」的候選路線。
 * `disrupted` 只應包含帶有結構化範圍的中斷路線。
 */
export function findScopeOverlaps(
  definitions: readonly RouteDefinition[],
  disrupted: readonly { routeId: string; scopes: readonly DisruptionScope[] }[],
): OverlapHit[] {
  const hits: OverlapHit[] = [];
  for (const definition of definitions) {
    for (const entry of disrupted) {
      if (entry.routeId === definition.id) continue;
      const scope = entry.scopes.find((candidate) => routeHitsScope(definition, candidate));
      if (scope) {
        hits.push({
          routeId: definition.id,
          disruptedRouteId: entry.routeId,
          reason: `與中斷路線 ${entry.routeId} 的受影響區段重疊：${describeScope(scope)}`,
        });
        break;
      }
    }
  }
  return hits;
}
