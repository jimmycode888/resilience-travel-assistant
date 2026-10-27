import type { FixtureScenario, Scenario, TripRequest } from "@/lib/types";
import { FIXTURE_SERVICE_DATE } from "./context/snapshots";

/**
 * 演示用的固定行程。三個情景只差在 `scenario`，其餘欄位完全相同，
 * 這樣「切換情景會得到不同建議」才容易被驗證。
 */
export const DEMO_REQUEST: TripRequest = {
  origin: "hang-hau-estate",
  destination: "central-exchange-square",
  arriveBy: `${FIXTURE_SERVICE_DATE}T09:00`,
  constraints: { maxExtraCost: 10, maxTransfers: 2 },
  scenario: "normal",
};

export function demoRequestFor(scenario: Scenario): TripRequest {
  return { ...DEMO_REQUEST, constraints: { ...DEMO_REQUEST.constraints }, scenario };
}

export function demoRequestForFixture(scenario: FixtureScenario): TripRequest {
  return demoRequestFor(scenario);
}

/** 用於自動化測試與凍結驗收的三個情景。 */
export const DEMO_SCENARIOS: readonly FixtureScenario[] = ["normal", "heavy_rain", "disruption"];
