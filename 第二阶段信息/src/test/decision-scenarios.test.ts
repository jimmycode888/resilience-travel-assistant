import { describe, expect, it } from "vitest";
import { decideTrip } from "@/lib/decision";
import { demoRequestForFixture, DEMO_SCENARIOS } from "@/lib/fixtures/demo-request";
import { getFixtureSnapshot } from "@/lib/fixtures/context";
import type { FixtureScenario } from "@/lib/types";

function decideFor(scenario: FixtureScenario) {
  return decideTrip(demoRequestForFixture(scenario), getFixtureSnapshot(scenario));
}

describe("三個確定性演示情景", () => {
  it("normal：港鐵主線為建議路線，到達信心高", () => {
    const result = decideFor("normal");
    expect(result.status).toBe("ready");
    expect(result.confidence).toBe("high");
    expect(result.primaryPlan?.routeId).toBe("R1");
    expect(result.planBPlan?.routeId).toBe("R2");
    expect(result.departAt).toBe("2026-10-13T08:09:00+08:00");
    expect(result.latestDepartAt).toBe("2026-10-13T08:15:00+08:00");
    expect(result.etaRange).toEqual(["2026-10-13T08:54:00+08:00", "2026-10-13T09:04:00+08:00"]);
    expect(result.primaryRoute.length).toBeGreaterThan(0);
    expect(result.planB.length).toBeGreaterThan(0);
    expect(result.switchCondition).not.toBe("");
  });

  it("heavy_rain：仍建議港鐵，但更早出發、信心降為中", () => {
    const normal = decideFor("normal");
    const rainy = decideFor("heavy_rain");
    expect(rainy.status).toBe("ready");
    expect(rainy.confidence).toBe("medium");
    expect(rainy.primaryPlan?.routeId).toBe("R1");
    expect(rainy.planBPlan?.routeId).toBe("R2");
    expect(rainy.departAt).toBe("2026-10-13T07:58:00+08:00");
    // 暴雨情景必須比正常情景更早出發（緩衝由 6 分鐘提高到 14 分鐘）。
    expect(Date.parse(rainy.departAt)).toBeLessThan(Date.parse(normal.departAt));
    expect(rainy.reasons.join(" ")).toContain("14 分鐘緩衝");
  });

  it("disruption：港鐵主線中斷，改建議過海巴士，信心低", () => {
    const result = decideFor("disruption");
    expect(result.status).toBe("uncertain");
    expect(result.confidence).toBe("low");
    expect(result.primaryPlan?.routeId).toBe("R2");
    expect(result.planBPlan?.routeId).toBe("R3");
    expect(result.departAt).toBe("2026-10-13T07:22:00+08:00");
    expect(result.excludedRoutes.map((route) => route.routeId)).toContain("R1");
    expect(result.switchCondition).toContain("Plan B");
  });

  it("三個情景產生不同且合理的建議", () => {
    const results = DEMO_SCENARIOS.map((scenario) => decideFor(scenario));
    const departures = results.map((result) => result.departAt);
    const primaries = results.map((result) => result.primaryPlan?.routeId);

    expect(new Set(departures).size).toBe(3);
    expect(primaries).toEqual(["R1", "R1", "R2"]);
    expect(results.map((result) => result.confidence)).toEqual(["high", "medium", "low"]);

    for (const result of results) {
      expect(result.dataQuality).toBe("fixture");
      expect(result.dataUpdatedAt).toBe("2026-10-13T07:30:00+08:00");
      expect(result.reasons.length).toBeGreaterThanOrEqual(4);
      expect(result.switchCondition.length).toBeGreaterThan(0);
      expect(result.dataSources.length).toBeGreaterThan(0);
      expect(result.disclaimer).toContain("準時機率");
      expect(result.scenario).toBeDefined();
      expect(result.serviceDate).toBe("2026-10-13");
    }
  });

  it("中斷情景必須明確說明主路線中斷，而不是假裝正常", () => {
    const result = decideFor("disruption");
    const text = [result.reasons.join(" "), ...result.notices].join(" ");
    expect(text).toContain("將軍澳線");
    expect(text).toContain("中斷");
    expect(text).toContain("fixture");
    // 排除原因不可使用嵌套括號（可讀性）
    expect(text).not.toContain("（服務中斷（");
  });
});

describe("路線步驟結構", () => {
  it("步驟時間連續且加總等於路線總時間", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const result = decideFor(scenario);
      const plan = result.primaryPlan;
      expect(plan).not.toBeNull();
      if (!plan) continue;

      const total = plan.steps.reduce((sum, step) => sum + step.durationMinutes, 0);
      expect(total).toBe(plan.durationMinutes);

      for (let index = 1; index < plan.steps.length; index += 1) {
        const previous = plan.steps[index - 1];
        const current = plan.steps[index];
        expect(current?.departAt).toBe(previous?.arriveAt);
      }

      const first = plan.steps[0];
      const last = plan.steps[plan.steps.length - 1];
      expect(first?.departAt).toBe(plan.departAt);
      expect(last?.arriveAt).toBe(plan.arriveAt);
    }
  });

  it("到達範圍的最早值不遲於最遲值，且都落在服務日", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const result = decideFor(scenario);
      expect(Date.parse(result.etaRange[0])).toBeLessThanOrEqual(Date.parse(result.etaRange[1]));
      expect(result.etaRange[0].endsWith("+08:00")).toBe(true);
      expect(result.etaRange[1].endsWith("+08:00")).toBe(true);
    }
  });

  it("主路線與 Plan B 使用不同的主要運輸方式", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const result = decideFor(scenario);
      const primaryModes = new Set(
        result.primaryRoute.filter((step) => step.mode !== "walk").map((step) => step.mode),
      );
      const planBModes = new Set(
        result.planB.filter((step) => step.mode !== "walk").map((step) => step.mode),
      );
      const overlap = [...planBModes].some((mode) => primaryModes.has(mode));
      expect(overlap).toBe(false);
    }
  });
});

describe("切換條件必須可執行", () => {
  it("每個情景都包含具體門檻、上車地點與時間", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const condition = decideFor(scenario).switchCondition;
      expect(condition).toMatch(/\d+ 分鐘/);
      expect(condition).toMatch(/巴士總站|站/);
      expect(condition).toMatch(/\d{2}:\d{2}/);
      expect(condition).toContain("Plan B");
    }
  });

  it("鐵路為主路線時，要說明巴士較慢、必須提早離開起點", () => {
    for (const scenario of ["normal", "heavy_rain"] as const) {
      const condition = decideFor(scenario).switchCondition;
      expect(condition).toContain("巴士較慢");
      expect(condition).toContain("坑口（北）巴士總站");
    }
  });

  it("巴士為主路線時，切換條件指向港鐵車站", () => {
    const condition = decideFor("disruption").switchCondition;
    expect(condition).toContain("坑口（北）巴士總站");
    expect(condition).toContain("坑口站");
    expect(condition).toContain("鰂魚涌轉乘");
  });
});
