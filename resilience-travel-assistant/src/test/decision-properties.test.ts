import { describe, expect, it } from "vitest";
import { decideTrip } from "@/lib/decision";
import { isDecisionResponse } from "@/lib/api-client";
import { DEMO_REQUEST } from "@/lib/fixtures/demo-request";
import { getFixtureSnapshot } from "@/lib/fixtures/context";
import type { ContextSnapshot, Crowding, RouteServiceStatus, RouteStatus, Scenario, TripRequest } from "@/lib/types";

/**
 * 屬性測試：不針對個別情景，而是在大量（種子固定、可重現）的合法輸入上，
 * 斷言決策層的不變條件恆成立。用來補「示例鎖定測試」覆蓋不到的交集。
 */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const SCENARIOS: Scenario[] = ["live", "normal", "heavy_rain", "disruption"];
const STATUSES: RouteStatus[] = ["ok", "delayed", "disrupted", "unknown"];
const CROWDING: Crowding[] = ["low", "medium", "high", "unknown"];
const DELAYS = [0, 3, 20, 55];
const COSTS = [0, 5, 10, 50];
const TRANSFERS = [0, 1, 2];

function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)]!;
}

function randomCase(seed: number): { request: TripRequest; snapshot: ContextSnapshot } {
  const rng = makeRng(seed);
  const base = getFixtureSnapshot("normal");

  const scenario = pick(rng, SCENARIOS);
  const day = Math.floor(rng() * 6);
  const hour = 5 + Math.floor(rng() * 17);
  const minute = pick(rng, [0, 15, 30, 45]);
  const arriveBy = `2026-10-${String(13 + day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  const request: TripRequest = {
    ...DEMO_REQUEST,
    arriveBy,
    constraints: { maxExtraCost: pick(rng, COSTS), maxTransfers: pick(rng, TRANSFERS) },
    scenario,
  };

  const routes: RouteServiceStatus[] = base.routes.map((route) => {
    const status = pick(rng, STATUSES);
    return {
      ...route,
      status,
      delayMinutes: status === "disrupted" ? 0 : pick(rng, DELAYS),
      crowding: pick(rng, CROWDING),
    };
  });

  return { request, snapshot: { ...base, routes } };
}

const CASES = Array.from({ length: 60 }, (_, index) => randomCase(index * 7919 + 13));

describe("決策層不變條件（60 組種子輸入）", () => {
  it.each(CASES.map((testCase, index) => [index, testCase] as const))(
    "case %i：輸出符合契約與不變條件",
    (_index, { request, snapshot }) => {
      const result = decideTrip(request, snapshot);

      expect(isDecisionResponse(result)).toBe(true);
      expect(result.basis.some((entry) => entry.type === "statistics")).toBe(false);
      expect(result.uncertainty.length).toBeGreaterThan(0);
      expect(result.dataUpdatedAt).toBe(snapshot.collectedAt);
      expect(result.dataQuality).toBe(snapshot.quality);

      if (result.status === "unavailable") {
        expect(result.departAt).toBe("");
        expect(result.etaRange).toEqual(["", ""]);
        expect(result.confidence).toBe("low");
        expect(result.primaryRoute).toEqual([]);
        expect(result.planB).toEqual([]);
        expect(result.action).toBe("hold");
        expect(result.switchDeadline).toBe("");
        expect(result.primaryPlan).toBeNull();
        return;
      }

      expect(result.departAt).not.toBe("");
      expect(result.primaryPlan).not.toBeNull();
      expect(result.action).not.toBe("hold");
      expect(Date.parse(result.etaRange[0])).toBeLessThanOrEqual(Date.parse(result.etaRange[1]));
      expect(result.departAt.endsWith("+08:00")).toBe(true);
      expect(result.etaRange[0].endsWith("+08:00")).toBe(true);
      expect(result.departAt).toBe(result.primaryPlan?.departAt);
      expect(result.primaryRoute[0]?.departAt).toBe(result.departAt);
      expect(result.primaryRoute.at(-1)?.arriveAt).toBe(result.primaryPlan?.arriveAt);

      // switchDeadline 與 Plan B 必須同時存在或同時為空。
      expect(result.switchDeadline === "").toBe(result.planBPlan === null);
      expect(result.planB.length === 0).toBe(result.planBPlan === null);

      for (const plan of [result.primaryPlan, result.planBPlan, ...result.candidates]) {
        if (!plan) continue;
        expect(plan.durationMinutes).toBe(plan.baseDurationMinutes + plan.delayMinutes);
        const total = plan.steps.reduce((sum, step) => sum + step.durationMinutes, 0);
        expect(total).toBe(plan.durationMinutes);
        for (let index = 1; index < plan.steps.length; index += 1) {
          expect(plan.steps[index]!.departAt).toBe(plan.steps[index - 1]!.arriveAt);
        }
        expect(plan.steps[0]?.departAt).toBe(plan.departAt);
        expect(plan.steps.at(-1)?.arriveAt).toBe(plan.arriveAt);
      }
    },
  );

  it("每個案例重複執行都逐位元組相同", () => {
    for (const { request, snapshot } of CASES.slice(0, 20)) {
      expect(JSON.stringify(decideTrip(request, snapshot))).toBe(
        JSON.stringify(decideTrip(request, snapshot)),
      );
    }
  });
});
