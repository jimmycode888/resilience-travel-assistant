/**
 * 輸入頁 ↔ 結果頁之間的參數編碼。
 *
 * 把整個 TripRequest 放進 URL 的用意：重新整理或分享連結都會得到完全相同的結果，
 * 不會因為隨機值或隱藏狀態而變動。
 */
import { DESTINATIONS, ORIGINS, findPlace } from "./corridor";
import { DEMO_REQUEST } from "./fixtures/demo-request";
import { SCENARIOS, type Scenario, type TripRequest } from "./types";
import { MAX_ALLOWED_TRANSFERS, MAX_EXTRA_COST_HKD } from "./validation";

export const TRIP_PARAM_KEYS = [
  "origin",
  "destination",
  "arriveBy",
  "maxExtraCost",
  "maxTransfers",
  "scenario",
] as const;

export function tripRequestToSearchParams(request: TripRequest): URLSearchParams {
  const params = new URLSearchParams();
  params.set("origin", request.origin);
  params.set("destination", request.destination);
  params.set("arriveBy", request.arriveBy);
  params.set("maxExtraCost", String(request.constraints.maxExtraCost));
  params.set("maxTransfers", String(request.constraints.maxTransfers));
  params.set("scenario", request.scenario);
  return params;
}

export function buildResultPath(request: TripRequest): string {
  return `/result?${tripRequestToSearchParams(request).toString()}`;
}

export interface ParsedTripParams {
  request: TripRequest;
  /** 非空表示 URL 有問題；UI 應該提示並提供返回輸入頁的連結。 */
  issues: string[];
}

export function tripRequestFromSearchParams(params: URLSearchParams): ParsedTripParams {
  const issues: string[] = [];

  const originRaw = params.get("origin") ?? DEMO_REQUEST.origin;
  const origin = findPlace(originRaw);
  if (!origin || origin.role !== "origin") {
    issues.push(
      `origin 必須是：${ORIGINS.map((place) => place.id).join(" | ")}（收到「${originRaw}」）。`,
    );
  }

  const destinationRaw = params.get("destination") ?? DEMO_REQUEST.destination;
  const destination = findPlace(destinationRaw);
  if (!destination || destination.role !== "destination") {
    issues.push(
      `destination 必須是：${DESTINATIONS.map((place) => place.id).join(" | ")}（收到「${destinationRaw}」）。`,
    );
  }

  const arriveByRaw = params.get("arriveBy") ?? DEMO_REQUEST.arriveBy;

  const scenarioRaw = params.get("scenario") ?? DEMO_REQUEST.scenario;
  if (!(SCENARIOS as readonly string[]).includes(scenarioRaw)) {
    issues.push(`scenario 必須是：${SCENARIOS.join(" | ")}（收到「${scenarioRaw}」）。`);
  }

  const maxExtraCost = parseIntegerParam(
    params.get("maxExtraCost"),
    DEMO_REQUEST.constraints.maxExtraCost,
    0,
    MAX_EXTRA_COST_HKD,
    "maxExtraCost",
    issues,
  );
  const maxTransfers = parseIntegerParam(
    params.get("maxTransfers"),
    DEMO_REQUEST.constraints.maxTransfers,
    0,
    MAX_ALLOWED_TRANSFERS,
    "maxTransfers",
    issues,
  );

  return {
    issues,
    request: {
      origin: origin?.role === "origin" ? origin.id : DEMO_REQUEST.origin,
      destination: destination?.role === "destination" ? destination.id : DEMO_REQUEST.destination,
      arriveBy: arriveByRaw,
      constraints: { maxExtraCost, maxTransfers },
      scenario: (SCENARIOS as readonly string[]).includes(scenarioRaw)
        ? (scenarioRaw as Scenario)
        : DEMO_REQUEST.scenario,
    },
  };
}

function parseIntegerParam(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
  name: string,
  issues: string[],
): number {
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    issues.push(`${name} 必須是 ${min}–${max} 的整數（收到「${raw}」）。`);
    return fallback;
  }
  return value;
}
