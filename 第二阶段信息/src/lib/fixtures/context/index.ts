import type { ContextSnapshot } from "@/lib/types";
import type { FixtureScenario } from "@/lib/types";
import {
  DISRUPTION_SNAPSHOT,
  HEAVY_RAIN_SNAPSHOT,
  NORMAL_SNAPSHOT,
} from "./snapshots";

export {
  DISRUPTION_SNAPSHOT,
  FIXTURE_COLLECTED_AT,
  FIXTURE_EXPIRES_AT,
  FIXTURE_SERVICE_DATE,
  HEAVY_RAIN_SNAPSHOT,
  NORMAL_SNAPSHOT,
} from "./snapshots";

/** 三個確定性演示情景對應的資料快照。 */
export const FIXTURE_SNAPSHOTS: Readonly<Record<FixtureScenario, ContextSnapshot>> = Object.freeze({
  normal: NORMAL_SNAPSHOT,
  heavy_rain: HEAVY_RAIN_SNAPSHOT,
  disruption: DISRUPTION_SNAPSHOT,
});

export function getFixtureSnapshot(scenario: FixtureScenario): ContextSnapshot {
  return FIXTURE_SNAPSHOTS[scenario];
}
