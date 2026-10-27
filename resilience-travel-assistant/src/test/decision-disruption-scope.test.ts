import { describe, expect, it } from "vitest";
import { decideTrip, findScopeOverlaps, readDisruptionScopes, routeHitsScope, segmentContains } from "@/lib/decision";
import { ROUTES } from "@/lib/corridor";
import { demoRequestForFixture } from "@/lib/fixtures/demo-request";
import { getFixtureSnapshot } from "@/lib/fixtures/context";
import type { ContextSnapshot, RouteServiceStatus } from "@/lib/types";

/**
 * 中斷區段重疊（回應 B 的 P0）：當快照提供結構化中斷範圍時，
 * 與該範圍重疊的候選路線必須同樣被排除；沒有提供時行為不變。
 */
const request = demoRequestForFixture("disruption");
const base = getFixtureSnapshot("disruption");

function withScopes(snapshot: ContextSnapshot, routeId: string, scopes: unknown): ContextSnapshot {
  return {
    ...snapshot,
    routes: snapshot.routes.map((route) =>
      route.routeId === routeId
        ? ({ ...route, affectedLineSegments: scopes } as unknown as RouteServiceStatus)
        : route,
    ),
  };
}

const lineScope = { kind: "line", line: "將軍澳線", from: "坑口站", to: "北角站" } as const;
const interchangeScope = { kind: "station", station: "北角站", impact: "interchange" } as const;

describe("區段覆蓋判定（站序來自官方靜態參考）", () => {
  it("將軍澳線：坑口→鰂魚涌 被 坑口→北角 覆蓋", () => {
    expect(segmentContains("將軍澳線", { from: "坑口站", to: "北角站" }, { from: "坑口站", to: "鰂魚涌站" })).toBe(true);
    // 反方向也要成立
    expect(segmentContains("將軍澳線", { from: "北角站", to: "坑口站" }, { from: "鰂魚涌站", to: "坑口站" })).toBe(true);
  });

  it("不在覆蓋範圍內或不同線 → false", () => {
    expect(segmentContains("將軍澳線", { from: "坑口站", to: "鰂魚涌站" }, { from: "北角站", to: "鰂魚涌站" })).toBe(false);
    expect(segmentContains("將軍澳線", { from: "坑口站", to: "北角站" }, { from: "坑口站", to: "北角站" })).toBe(true);
    expect(segmentContains("港島線", { from: "鰂魚涌站", to: "中環站" }, { from: "北角站", to: "中環站" })).toBe(true);
    expect(segmentContains("港島線", { from: "北角站", to: "中環站" }, { from: "鰂魚涌站", to: "中環站" })).toBe(false);
  });

  it("站序未知的線只做端點精確比對", () => {
    expect(segmentContains("未知線", { from: "A", to: "B" }, { from: "A", to: "B" })).toBe(true);
    expect(segmentContains("未知線", { from: "A", to: "C" }, { from: "A", to: "B" })).toBe(false);
  });
});

describe("路線是否落在中斷範圍內", () => {
  const r1 = ROUTES.find((route) => route.id === "R1")!;
  const r3 = ROUTES.find((route) => route.id === "R3")!;
  const r2 = ROUTES.find((route) => route.id === "R2")!;

  it("線段中斷：R1 與 R3 都受影響，巴士 R2 不受影響", () => {
    expect(routeHitsScope(r1, lineScope)).toBe(true);
    expect(routeHitsScope(r3, lineScope)).toBe(true);
    expect(routeHitsScope(r2, lineScope)).toBe(false);
  });

  it("只有北角站轉乘受阻：R1 不可用，R3（鰂魚涌轉乘）仍可用", () => {
    expect(routeHitsScope(r1, interchangeScope)).toBe(true);
    expect(routeHitsScope(r3, interchangeScope)).toBe(false);
  });

  it("findScopeOverlaps 回報重疊的候選路線", () => {
    const hits = findScopeOverlaps(ROUTES, [{ routeId: "R1", scopes: [lineScope] }]);
    expect(hits.map((hit) => hit.routeId)).toContain("R3");
    expect(hits.map((hit) => hit.routeId)).not.toContain("R2");
  });
});

describe("readDisruptionScopes 的防禦性", () => {
  it("缺欄位或格式不符時回傳空陣列（不作用）", () => {
    const service = base.routes[0]!;
    expect(readDisruptionScopes(service)).toEqual([]);
    const garbage = { ...service, affectedLineSegments: [{ kind: "???" }, 1, null] } as unknown as RouteServiceStatus;
    expect(readDisruptionScopes(garbage)).toEqual([]);
    const good = { ...service, affectedLineSegments: [lineScope] } as unknown as RouteServiceStatus;
    expect(readDisruptionScopes(good)).toHaveLength(1);
  });
});

describe("引擎整合：重疊路線同樣被排除", () => {
  it("沒有結構化範圍 → 行為不變（R3 仍為 Plan B）", () => {
    const result = decideTrip(request, base);
    expect(result.candidates.map((plan) => plan.routeId)).toContain("R3");
    expect(result.planBPlan?.routeId).toBe("R3");
  });

  it("R1 宣告「坑口→北角」停運 → R3 一併排除，不再提供不可行的 Plan B", () => {
    const snapshot = withScopes(base, "R1", [lineScope]);
    const result = decideTrip(request, snapshot);

    expect(result.candidates.map((plan) => plan.routeId)).not.toContain("R3");
    expect(result.excludedRoutes.map((route) => route.routeId)).toContain("R3");
    expect(result.excludedRoutes.find((route) => route.routeId === "R3")?.reason).toContain("重疊");
    expect(result.planBPlan).toBeNull();
    expect(result.switchCondition).toBe("");
    expect(result.status).toBe("uncertain");
  });

  it("改為「北角站轉乘受阻」→ R3 仍可作 Plan B（保留演示敘事）", () => {
    const snapshot = withScopes(base, "R1", [interchangeScope]);
    const result = decideTrip(request, snapshot);

    expect(result.candidates.map((plan) => plan.routeId)).toContain("R3");
    expect(result.planBPlan?.routeId).toBe("R3");
    expect(result.switchCondition).not.toBe("");
  });

  it("重疊規則下結果仍完全確定", () => {
    const snapshot = withScopes(base, "R1", [lineScope]);
    expect(JSON.stringify(decideTrip(request, snapshot))).toBe(JSON.stringify(decideTrip(request, snapshot)));
  });
});
