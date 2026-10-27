import { describe, expect, it } from "vitest";
import { decideTrip } from "@/lib/decision";
import { DEMO_REQUEST } from "@/lib/fixtures/demo-request";
import { getFixtureSnapshot } from "@/lib/fixtures/context";
import type { ContextSnapshot, TripRequest } from "@/lib/types";

function requestWith(overrides: Partial<TripRequest> = {}): TripRequest {
  return { ...DEMO_REQUEST, ...overrides };
}

function snapshotWith(overrides: Partial<ContextSnapshot>): ContextSnapshot {
  return { ...getFixtureSnapshot("normal"), ...overrides };
}

describe("無效時間", () => {
  it("到達時間早於首班服務 → unavailable，並說明原因", () => {
    const result = decideTrip(
      requestWith({ arriveBy: "2026-10-13T05:45" }),
      getFixtureSnapshot("normal"),
    );
    expect(result.status).toBe("unavailable");
    expect(result.departAt).toBe("");
    expect(result.etaRange).toEqual(["", ""]);
    expect(result.primaryRoute).toEqual([]);
    expect(result.planB).toEqual([]);
    expect(result.confidence).toBe("low");
    expect(result.reasons.join(" ")).toContain("首班服務時間");
    expect(result.excludedRoutes.length).toBe(3);
  });

  it("unavailable 仍然是有效的決策結果，且保留資料來源與時間", () => {
    const result = decideTrip(
      requestWith({ arriveBy: "2026-10-13T05:45" }),
      getFixtureSnapshot("normal"),
    );
    expect(result.dataUpdatedAt).toBe("2026-10-13T07:30:00+08:00");
    expect(result.dataQuality).toBe("fixture");
    expect(result.disclaimer.length).toBeGreaterThan(0);
    expect(result.generatedFor.arriveBy).toBe("2026-10-13T05:45:00+08:00");
  });

  it("到達時間落在服務日尾段仍然可計算", () => {
    const result = decideTrip(
      requestWith({ arriveBy: "2026-10-13T22:30" }),
      getFixtureSnapshot("normal"),
    );
    expect(result.status).toBe("ready");
    expect(result.departAt.startsWith("2026-10-13T")).toBe(true);
  });

  it("跨越到隔日的到達時間使用該日作為服務日", () => {
    const result = decideTrip(
      requestWith({ arriveBy: "2026-11-03T09:00" }),
      getFixtureSnapshot("normal"),
    );
    expect(result.status).toBe("ready");
    expect(result.serviceDate).toBe("2026-11-03");
    expect(result.departAt.startsWith("2026-11-03T")).toBe(true);
    expect(result.notices.join(" ")).toContain("服務日樣本");
  });
});

describe("限制條件排除路線", () => {
  it("maxTransfers = 0 在正常情景只剩免轉乘的巴士", () => {
    const result = decideTrip(
      requestWith({ constraints: { maxExtraCost: 10, maxTransfers: 0 } }),
      getFixtureSnapshot("normal"),
    );
    expect(result.primaryPlan?.routeId).toBe("R2");
    expect(result.primaryPlan?.transfers).toBe(0);
    expect(result.planBPlan).toBeNull();
    expect(result.status).toBe("uncertain");
    expect(result.switchCondition).toBe("");
    expect(result.excludedRoutes.length).toBe(2);
  });

  it("maxExtraCost = 0 排除巴士，中斷情景只剩經鰂魚涌的港鐵方案且沒有 Plan B", () => {
    const result = decideTrip(
      requestWith({
        constraints: { maxExtraCost: 0, maxTransfers: 2 },
        scenario: "disruption",
      }),
      getFixtureSnapshot("disruption"),
    );
    expect(result.primaryPlan?.routeId).toBe("R3");
    expect(result.planBPlan).toBeNull();
    expect(result.status).toBe("uncertain");
    expect(result.confidence).toBe("low");
    expect(result.excludedRoutes.map((route) => route.routeId).sort()).toEqual(["R1", "R2"]);
    const busReason = result.excludedRoutes.find((route) => route.routeId === "R2")?.reason ?? "";
    expect(busReason).toContain("額外車費");
    expect(result.notices.join(" ")).toContain("已排除 2 條路線");
  });

  it("若同時沒有其他可用路線，maxExtraCost = 0 會導致 unavailable", () => {
    const snapshot = getFixtureSnapshot("disruption");
    const railDown = {
      ...snapshot,
      routes: snapshot.routes.map((route) =>
        route.routeId === "R2" ? route : { ...route, status: "disrupted" as const, delayMinutes: 0 },
      ),
    };
    const result = decideTrip(
      requestWith({ constraints: { maxExtraCost: 0, maxTransfers: 2 }, scenario: "disruption" }),
      railDown,
    );
    expect(result.status).toBe("unavailable");
    expect(result.excludedRoutes.length).toBe(3);
    expect(result.reasons.join(" ")).toContain("沒有可行的路線建議");
  });
});

describe("缺少路線資料", () => {
  it("完全沒有路線狀態 → 狀態未確認，不得編造為正常", () => {
    const result = decideTrip(DEMO_REQUEST, snapshotWith({ routes: [] }));
    expect(result.status).toBe("uncertain");
    expect(result.confidence).toBe("low");
    expect(result.primaryPlan).not.toBeNull();
    expect(result.primaryPlan?.status).toBe("unknown");
    expect(result.reasons.join(" ")).toContain("未確認");
  });

  it("全部路線中斷 → unavailable", () => {
    const snapshot = getFixtureSnapshot("normal");
    const allDisrupted = snapshotWith({
      routes: snapshot.routes.map((route) => ({
        ...route,
        status: "disrupted" as const,
        delayMinutes: 0,
      })),
    });
    const result = decideTrip(DEMO_REQUEST, allDisrupted);
    expect(result.status).toBe("unavailable");
    expect(result.excludedRoutes.length).toBe(3);
  });

  it("只有一條可行路線時不再提供 Plan B，狀態降為 uncertain", () => {
    const snapshot = getFixtureSnapshot("normal");
    const onlyFirstUsable = snapshotWith({
      routes: snapshot.routes.map((route) =>
        route.routeId === "R1" ? route : { ...route, status: "disrupted" as const },
      ),
    });
    const result = decideTrip(DEMO_REQUEST, onlyFirstUsable);
    expect(result.primaryPlan?.routeId).toBe("R1");
    expect(result.planBPlan).toBeNull();
    expect(result.planB).toEqual([]);
    expect(result.status).toBe("uncertain");
    expect(result.switchCondition).toBe("");
    expect(result.reasons.join(" ")).toContain("沒有可用的 Plan B");
  });
});

describe("決策引擎的防禦性檢查", () => {
  it("收到無法解析的地點時會拋出清楚的錯誤（由 API 層轉成 500）", () => {
    expect(() => decideTrip(requestWith({ origin: "nope" }), getFixtureSnapshot("normal"))).toThrow(
      /無法解析地點/,
    );
  });

  it("收到無效 arriveBy 時會拋出錯誤", () => {
    expect(() =>
      decideTrip(requestWith({ arriveBy: "2026-02-30T09:00" }), getFixtureSnapshot("normal")),
    ).toThrow(/arriveBy/);
  });

  it("不修改傳入的請求物件或快照", () => {
    const request = requestWith();
    const snapshot = getFixtureSnapshot("normal");
    const requestCopy = structuredClone(request);
    const snapshotCopy = structuredClone(snapshot);
    decideTrip(request, snapshot);
    expect(request).toEqual(requestCopy);
    expect(snapshot).toEqual(snapshotCopy);
  });
});
