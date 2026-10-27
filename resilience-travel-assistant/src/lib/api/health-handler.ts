/**
 * GET /api/health 的處理邏輯。
 * 回傳服務狀態、版本、時間，以及目前可用的演示情景與資料品質。
 */
import { CORRIDOR } from "@/lib/corridor";
import { FIXTURE_SNAPSHOTS } from "@/lib/fixtures/context";
import { liveProvidersConfigured } from "@/lib/adapters/live-providers";
import { toHkIso } from "@/lib/time";
import { FIXTURE_SCENARIOS, type FixtureScenario } from "@/lib/types";

export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  /** 伺服器時間（香港時區 ISO 8601）。 */
  time: string;
  uptimeSeconds: number;
  corridor: { id: string; name: string };
  scenarios: FixtureScenario[];
  /** 每個情景的資料擷取時間與品質，讓任何人一眼看出這是演示資料。 */
  fixtures: Record<FixtureScenario, { collectedAt: string; expiresAt: string; quality: string }>;
  liveDataConfigured: boolean;
  allowFaultInjection: boolean;
}

export interface HealthHandlerDeps {
  version?: string;
  now?: () => number;
  uptimeSeconds?: number;
}

export function buildHealthResponse(deps: HealthHandlerDeps = {}): HealthResponse {
  const now = deps.now ?? (() => Date.now());
  const version = deps.version ?? process.env.APP_VERSION ?? "0.1.0";

  const fixtures = FIXTURE_SCENARIOS.reduce(
    (accumulator, scenario) => {
      const snapshot = FIXTURE_SNAPSHOTS[scenario];
      accumulator[scenario] = {
        collectedAt: snapshot.collectedAt,
        expiresAt: snapshot.expiresAt,
        quality: snapshot.quality,
      };
      return accumulator;
    },
    {} as HealthResponse["fixtures"],
  );

  return {
    status: "ok",
    service: "resilience-travel-assistant",
    version,
    time: toHkIso(now()),
    uptimeSeconds: deps.uptimeSeconds ?? Math.round(process.uptime()),
    corridor: { id: CORRIDOR.id, name: CORRIDOR.name },
    scenarios: [...FIXTURE_SCENARIOS],
    fixtures,
    liveDataConfigured: liveProvidersConfigured(),
    allowFaultInjection: process.env.ALLOW_FAULT_INJECTION === "1",
  };
}
