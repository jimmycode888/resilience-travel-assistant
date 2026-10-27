import { describe, expect, it } from "vitest";
import { resolveContextWithTier, SnapshotCache } from "@/lib/adapters";
import { handleDecisionRequest } from "@/lib/api/decision-handler";
import { isDecisionResponse } from "@/lib/api-client";
import { decideTrip } from "@/lib/decision";
import { ROUTES } from "@/lib/corridor";
import { demoRequestFor } from "@/lib/fixtures/demo-request";
import type { ContextResolution, DecisionResponse, Scenario } from "@/lib/types";

/**
 * C ↔ A / B 的整合驗證：
 *   B（resolveContextWithTier，注入空來源 → 三層回退）
 *     → C（decideTrip）
 *       → A（handleDecisionRequest / isDecisionResponse / 錯誤結構）
 * 全程不連網，且不使用專案自己的 fixture 常數偷懶：路由覆蓋、時間格式與欄位語意都重新檢查。
 */
const freshResolution = (scenario: Scenario): Promise<ContextResolution> =>
  resolveContextWithTier({ scenario, providers: [], cache: new SnapshotCache() }).then(
    (resolved) => resolved.resolution,
  );

function assertAdditiveShape(response: DecisionResponse): void {
  expect(["depart_now", "depart_at", "wait", "hold"]).toContain(response.action);
  expect(response.basis.length).toBeGreaterThan(0);
  for (const entry of response.basis) {
    expect(["rule", "data"]).toContain(entry.type);
    expect(entry.claim.length).toBeGreaterThan(0);
  }
  expect(response.uncertainty.length).toBeGreaterThan(0);
  expect(response.switchDeadline === "").toBe(response.planBPlan === null);
  if (response.switchDeadline !== "") {
    expect(response.switchDeadline).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
    expect(response.switchCondition).not.toBe("");
  }
}

describe("B → C → A 整合（不連網）", () => {
  it.each<Scenario>(["normal", "heavy_rain", "disruption", "live"])(
    "%s：B 的快照能完整流進 C，且輸出通過 A 的契約檢查",
    async (scenario) => {
      const resolution = await freshResolution(scenario);
      const request = demoRequestFor(scenario);
      const response = decideTrip(request, resolution.snapshot, { notices: resolution.notices });

      expect(isDecisionResponse(response)).toBe(true);
      expect(response.scenario).toBe(scenario);
      expect(response.dataQuality).toBe(resolution.quality);
      expect(response.dataUpdatedAt).toBe(resolution.snapshot.collectedAt);
      assertAdditiveShape(response);
    },
  );

  it("B 的路線狀態覆蓋走廊內全部路線；C 對缺少的路線視為 unknown", async () => {
    const resolution = await freshResolution("normal");
    expect(resolution.snapshot.routes.map((route) => route.routeId).sort()).toEqual(
      ROUTES.map((route) => route.id).sort(),
    );
  });

  it("live 在沒有來源時回退 fixture，並在 notices 誠實說明", async () => {
    const resolution = await freshResolution("live");
    expect(resolution.quality).toBe("fixture");
    expect(resolution.notices.join(" ")).toContain("實時資料來源");

    const response = decideTrip(demoRequestFor("live"), resolution.snapshot, {
      notices: resolution.notices,
    });
    expect(response.dataQuality).toBe("fixture");
    expect(response.notices.join(" ")).toContain("實時資料來源");
  });

  it("A 的 handler 端到端：200 + 契約欄位齊全", async () => {
    const result = await handleDecisionRequest(
      { ...demoRequestFor("heavy_rain") },
      { resolveContext: ({ scenario }) => freshResolution(scenario) },
    );
    expect(result.status).toBe(200);
    if (!isDecisionResponse(result.body)) throw new Error("handler 回傳不符合契約");
    expect(result.body.status).toBe("ready");
    assertAdditiveShape(result.body);
  });

  it("unavailable 是合法決策結果：HTTP 200、hold、不提供時間", async () => {
    const result = await handleDecisionRequest(
      { ...demoRequestFor("normal"), arriveBy: "2026-10-13T05:45" },
      { resolveContext: ({ scenario }) => freshResolution(scenario) },
    );
    expect(result.status).toBe(200);
    if (!isDecisionResponse(result.body)) throw new Error("handler 回傳不符合契約");
    expect(result.body.status).toBe("unavailable");
    expect(result.body.departAt).toBe("");
    expect(result.body.action).toBe("hold");
    expect(result.body.uncertainty.length).toBeGreaterThan(0);
  });

  it("A 的 isDecisionResponse 只要求鎖定欄位（新增欄位缺失也算合法最小回應）", () => {
    const minimal = {
      status: "ready",
      departAt: "2026-10-13T08:09:00+08:00",
      etaRange: ["2026-10-13T08:54:00+08:00", "2026-10-13T09:04:00+08:00"],
      confidence: "high",
      primaryRoute: [],
      planB: [],
      switchCondition: "",
      reasons: [],
      dataUpdatedAt: "2026-10-13T07:30:00+08:00",
      dataQuality: "fixture",
    };
    expect(isDecisionResponse(minimal)).toBe(true);
  });
});
