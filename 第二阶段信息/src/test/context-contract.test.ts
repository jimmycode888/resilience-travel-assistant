import { describe, expect, it } from "vitest";
import { decideTrip } from "@/lib/decision";
import { DEMO_REQUEST } from "@/lib/fixtures/demo-request";
import { FIXTURE_SNAPSHOTS, getFixtureSnapshot } from "@/lib/fixtures/context";
import { ROUTES, type RouteDefinition } from "@/lib/corridor";
import { FIXTURE_SCENARIOS, type ContextSnapshot } from "@/lib/types";

/**
 * ContextSnapshot 契約測試（成員 B 的交付要求）。
 * 對應成員 B 指令書：scenario / weather（含更新時間）/ 路線狀態（含更新時間）/
 * 來源（名稱 + URL + 說明）/ dataQuality / collectedAt / expiresAt。
 */

function snapshotWith(overrides: Partial<ContextSnapshot>): ContextSnapshot {
  return { ...getFixtureSnapshot("normal"), ...overrides };
}

describe("ContextSnapshot 契約", () => {
  it.each(FIXTURE_SCENARIOS)("%s 快照具備所有必要欄位", (scenario) => {
    const snapshot = FIXTURE_SNAPSHOTS[scenario];
    expect(snapshot.scenario).toBe(scenario);
    expect(snapshot.serviceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(snapshot.collectedAt).toMatch(/\+08:00$/);
    expect(snapshot.expiresAt).toMatch(/\+08:00$/);
    expect(["live", "cached", "fixture"]).toContain(snapshot.quality);
    expect(snapshot.weather.updatedAt).toMatch(/\+08:00$/);
    expect(snapshot.sources.length).toBeGreaterThan(0);
  });

  it("擷取時間早於失效時間", () => {
    for (const scenario of FIXTURE_SCENARIOS) {
      const snapshot = FIXTURE_SNAPSHOTS[scenario];
      expect(Date.parse(snapshot.collectedAt)).toBeLessThan(Date.parse(snapshot.expiresAt));
    }
  });

  it("每條路線都有更新時間，且覆蓋走廊內全部路線", () => {
    for (const scenario of FIXTURE_SCENARIOS) {
      const snapshot = FIXTURE_SNAPSHOTS[scenario];
      for (const route of snapshot.routes) {
        expect(route.updatedAt).toMatch(/\+08:00$/);
        expect(ROUTES.map((definition) => definition.id)).toContain(route.routeId);
      }
      expect(snapshot.routes.length).toBe(ROUTES.length);
    }
  });

  it("每個資料來源都有名稱、URL 欄位與更新時間", () => {
    for (const scenario of FIXTURE_SCENARIOS) {
      for (const source of FIXTURE_SNAPSHOTS[scenario].sources) {
        expect(source.id.length).toBeGreaterThan(0);
        expect(source.label.length).toBeGreaterThan(0);
        expect(source).toHaveProperty("url");
        expect(source.updatedAt).toMatch(/\+08:00$/);
        expect(["live", "cached", "fixture"]).toContain(source.quality);
      }
    }
  });

  it("fixture 的來源必須標示為 fixture，不得偽裝成 live", () => {
    for (const scenario of FIXTURE_SCENARIOS) {
      const snapshot = FIXTURE_SNAPSHOTS[scenario];
      expect(snapshot.quality).toBe("fixture");
      for (const source of snapshot.sources) {
        expect(source.quality).toBe("fixture");
      }
    }
  });

  it("三個情景的天氣與路線狀態確實不同（不是複製同一份）", () => {
    const fingerprints = FIXTURE_SCENARIOS.map((scenario) =>
      JSON.stringify({
        weather: FIXTURE_SNAPSHOTS[scenario].weather,
        routes: FIXTURE_SNAPSHOTS[scenario].routes,
      }),
    );
    expect(new Set(fingerprints).size).toBe(FIXTURE_SCENARIOS.length);
  });

  it("fixture 不含個人資料欄位", () => {
    const serialized = JSON.stringify(FIXTURE_SNAPSHOTS);
    for (const forbidden of ["email", "phone", "userId", "deviceId", "lat", "lng", "gps"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe("資料過期時降級（不得假裝確定）", () => {
  it("live 資料過期 → 信心降為低、狀態變 uncertain，並說明原因", () => {
    const stale = snapshotWith({ quality: "live" });
    const result = decideTrip(DEMO_REQUEST, stale, { now: "2026-10-13T09:30:00+08:00" });

    expect(result.confidence).toBe("low");
    expect(result.status).toBe("uncertain");
    expect(result.notices.join(" ")).toContain("過期");
    expect(result.reasons.join(" ")).toContain("過期");
    // 建議仍然可用（不是 unavailable），只是信心被誠實降級。
    expect(result.departAt).not.toBe("");
    expect(result.primaryPlan).not.toBeNull();
  });

  it("過期時信心分數會被壓到 medium 門檻以下，避免敘述矛盾", () => {
    const stale = snapshotWith({ quality: "live" });
    const result = decideTrip(DEMO_REQUEST, stale, { now: "2026-10-13T09:30:00+08:00" });
    const reason = result.reasons.find((line) => line.includes("規則分數")) ?? "";
    const score = Number(/規則分數 (\d+)\/100/.exec(reason)?.[1] ?? "999");
    expect(score).toBeLessThan(45);
  });

  it("未過期時不受影響（同一份資料、不同現在時間）", () => {
    const fresh = snapshotWith({ quality: "live" });
    const result = decideTrip(DEMO_REQUEST, fresh, { now: "2026-10-13T07:40:00+08:00" });
    expect(result.confidence).toBe("high");
    expect(result.status).toBe("ready");
    expect(result.notices.join(" ")).not.toContain("過期");
  });

  it("fixture 不套用實時資料的效期規則（演示資料是刻意標示的樣本）", () => {
    const fixture = getFixtureSnapshot("normal");
    const result = decideTrip(DEMO_REQUEST, fixture, { now: "2027-01-01T00:00:00+08:00" });
    expect(result.confidence).toBe("high");
    expect(result.status).toBe("ready");
  });

  it("未提供 now 時視為未過期", () => {
    const result = decideTrip(DEMO_REQUEST, snapshotWith({ quality: "live" }));
    expect(result.confidence).toBe("high");
  });
});

describe("候選路線可注入（成員 C 可測試自訂路線）", () => {
  it("只提供一條路線時，該路線成為主路線且沒有 Plan B", () => {
    const onlyBus = ROUTES.filter((route): route is RouteDefinition => route.id === "R2");
    const result = decideTrip(DEMO_REQUEST, getFixtureSnapshot("normal"), { routes: onlyBus });
    expect(result.primaryPlan?.routeId).toBe("R2");
    expect(result.planBPlan).toBeNull();
    expect(result.candidates.length).toBe(1);
    expect(result.status).toBe("uncertain");
  });

  it("提供空的路線清單時回傳 unavailable", () => {
    const result = decideTrip(DEMO_REQUEST, getFixtureSnapshot("normal"), { routes: [] });
    expect(result.status).toBe("unavailable");
    expect(result.primaryPlan).toBeNull();
  });

  it("適配層的 notices 會原樣帶進回應", () => {
    const result = decideTrip(DEMO_REQUEST, getFixtureSnapshot("normal"), {
      notices: ["實時資料逾時，已回退。"],
    });
    expect(result.notices).toContain("實時資料逾時，已回退。");
  });
});
