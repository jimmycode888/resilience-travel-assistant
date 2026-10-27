/**
 * B 在正式組合層（`TeamJourneyModules`）的注入實作（成員 B 所有）。
 *
 * 契約由 A 定義：`resolveRouteData(route, request) → RouteDataEnvelope | null`。
 * 這裡把 B 已核查的實時來源正規化成風險引擎認得的最小形狀：
 *   - weather   ← 香港天文台（HKO rhrread + warnsum）
 *   - incidents ← 運輸署特別交通消息
 *   - border    ← 口岸排隊**估算**（`port-conditions.ts`，區間 + 置信度）
 *   - service   ← 港鐵抵站／延誤旗標（只有觀測到「有延誤」才敢說延誤）
 *
 * 兩個硬約束：
 *   1. **預設關閉**：沒有設定任何實時來源環境變數時回 `null`，讓組合層走保守路徑——
 *      絕不用 fixture 冒充正式資料。
 *   2. 說不出來的就留 `null`：例如「沒有公告」不等於「服務正常」。
 */
import { toHkIso } from "@/lib/time";
import type { Incident } from "@/lib/types/context";
import type { RiskIncident, RiskService } from "@/lib/types/risk";
import type { CandidateRoute, RouteQuality } from "@/lib/types/route";
import type { RouteDataEnvelope, TeamJourneyRequest } from "@/lib/types/team-integration";
import { findPort, listPorts } from "@/lib/geo/ports";
import { SourceClient, type SourceRead } from "./source-client";
import { createHkoWeatherProvider, createTransportDepartmentProvider } from "./live-providers";
import type { LiveDataProvider } from "./types";
import { PortConditionClient, portConditionClient, type BorderConditions, type PortObservation, estimateBorderQueue } from "./port-conditions";

const QUALITY_ORDER: readonly RouteQuality[] = ["fixture", "cached", "live"];

/** 取最差的品質層級（fixture 不得被 live 蓋掉）。 */
export function worstQuality(...values: RouteQuality[]): RouteQuality {
  return values.reduce<RouteQuality>(
    (worst, value) => (QUALITY_ORDER.indexOf(value) < QUALITY_ORDER.indexOf(worst) ? value : worst),
    "live",
  );
}

/** 是否已設定任一實時來源。未設定時 B 一律回 `null`（保守路徑）。 */
export function teamLiveDataEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (
    env.TEAM_LIVE_DATA_ENABLED === "1" ||
    Boolean(env.HKO_OPEN_DATA_BASE_URL?.trim()) ||
    Boolean(env.TD_SPECIAL_TRAFFIC_NEWS_URL?.trim()) ||
    env.MTR_NEXT_TRAIN_ENABLED === "1"
  );
}

const incidentToRisk = (incident: Incident): RiskIncident => ({
  id: incident.id,
  title: incident.title,
  detail: incident.detail,
  affects: [incident.title, incident.detail],
});

/**
 * 港鐵只提供 `isdelay = Y/N`，**沒有延誤分鐘數**。
 * 所以有延誤旗標才報 `delayed`；沒有旗標如實報 `unknown`，絕不報 `ok`（沒消息不等於正常）。
 */
export function serviceFromObservation(observation: PortObservation | undefined): RiskService | null {
  if (!observation || observation.quality === "fixture" || observation.delayReported === null) return null;
  if (observation.delayReported) {
    return { status: "delayed", delayMinutes: 0, crowding: "unknown", updatedAt: observation.updatedAt };
  }
  return { status: "unknown", delayMinutes: 0, crowding: "unknown", updatedAt: observation.updatedAt };
}

/** 找出這個口岸用來判斷鐵路狀態的觀測（只有鐵路口岸才有）。 */
export function railObservationFor(conditions: BorderConditions, portId: string): PortObservation | undefined {
  return (conditions.observationsByPort[portId] ?? []).find((row) => row.sourceId.includes("mtr"));
}

function qualityForPort(conditions: BorderConditions, portId: string): RouteQuality {
  const rows = conditions.sources.filter((source) => source.id.includes(portId));
  if (rows.length === 0) return "fixture";
  return worstQuality(...rows.map((row) => row.quality as RouteQuality));
}

export interface TeamDataDeps {
  now?: () => number;
  timeoutMs?: number;
  client?: PortConditionClient;
  env?: Record<string, string | undefined>;
  /** 天氣來源；測試可注入。未提供時依環境變數決定（未設定即為 null）。 */
  weatherProvider?: LiveDataProvider | null;
  /** 交通公告來源；測試可注入。未提供時依環境變數決定（未設定即為 null）。 */
  trafficProvider?: LiveDataProvider | null;
}

interface RequestContext {
  weather: SourceRead;
  traffic: SourceRead;
  conditions: BorderConditions;
}

const HKO_URL = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php";
const TD_URL = "https://www.td.gov.hk/en/special_news/trafficnews.xml";
export const MAX_LIVE_HORIZON_MS = 2 * 3600000;

/** Bounded 30-second reuse and single in-flight batch, never an unbounded departAt map. */
export function createRouteDataResolver(deps: TeamDataDeps = {}) {
  const now = deps.now ?? Date.now;
  const client = deps.client ?? portConditionClient;
  const env = deps.env ?? process.env;
  const sourceClient = new SourceClient(now, deps.timeoutMs ?? 2500);
  const configure = () => ({ ...env,
    HKO_OPEN_DATA_BASE_URL: env.HKO_OPEN_DATA_BASE_URL || (env.TEAM_LIVE_DATA_ENABLED === "1" ? HKO_URL : undefined),
    TD_SPECIAL_TRAFFIC_NEWS_URL: env.TD_SPECIAL_TRAFFIC_NEWS_URL || (env.TEAM_LIVE_DATA_ENABLED === "1" ? TD_URL : undefined),
  });
  let pending: Promise<RequestContext> | null = null;
  let memo: RequestContext | null = null;
  let reuseUntil = 0;
  async function loadContext(): Promise<RequestContext> {
    if (memo && now() < reuseUntil) return {
      ...memo,
      weather: { ...memo.weather, quality: memo.weather.quality === "live" ? "cached" : memo.weather.quality },
      traffic: { ...memo.traffic, quality: memo.traffic.quality === "live" ? "cached" : memo.traffic.quality },
    };
    if (pending) return pending;
    pending = (async () => {
      const configured = configure();
      const weatherProvider = deps.weatherProvider !== undefined ? deps.weatherProvider : createHkoWeatherProvider(configured);
      const trafficProvider = deps.trafficProvider !== undefined ? deps.trafficProvider : createTransportDepartmentProvider(configured);
      const [weather, traffic, conditions] = await Promise.all([
        sourceClient.read(weatherProvider, "weather", configured.HKO_OPEN_DATA_BASE_URL ?? HKO_URL),
        sourceClient.read(trafficProvider, "incidents", configured.TD_SPECIAL_TRAFFIC_NEWS_URL ?? TD_URL),
        client.resolve({ at: toHkIso(now()) }),
      ]);
      memo = { weather, traffic, conditions };
      const portStamps = Object.values(conditions.observationsByPort).flat().filter((row) => row.quality !== "fixture").map((row) => Date.parse(row.updatedAt) + 120000);
      reuseUntil = Math.min(now() + 30000, weather.expiresAt, traffic.expiresAt, ...portStamps);
      return memo;
    })();
    try { return await pending; } finally { pending = null; }
  }
  return async function resolveRouteData(route: CandidateRoute, request: TeamJourneyRequest): Promise<RouteDataEnvelope | null> {
    if (!teamLiveDataEnabled(env)) return null;
    const context = await loadContext();
    const borders = route.journey.segments.filter((segment) => segment.kind === "border_crossing");
    const crossing = borders[0];
    const portId = crossing?.border?.portId ?? null;
    const relevantRows = portId ? context.conditions.observationsByPort[portId] ?? [] : [];
    const at = crossing?.departAt ?? request.departAt;
    const withinHorizon = Number.isFinite(Date.parse(at)) && Math.abs(Date.parse(at) - now()) <= MAX_LIVE_HORIZON_MS;
    const incidentsRaw = context.traffic.payload?.incidents ?? [];
    const candidateNames = route.journey.segments.flatMap((segment) => [segment.from.name, segment.to.name, ...segment.viaStations, ...segment.viaDistricts]);
    const incidents = incidentsRaw.map((incident) => {
      const text = incident.title + incident.detail;
      const port = portId ? findPort(portId) : undefined;
      const related = port && (text.includes(port.name.replace("口岸", "")) || (portId === "lok-ma-chau" && /落馬洲|福田口岸/.test(text)));
      const affects = candidateNames.filter((name) => text.includes(name));
      return { ...incidentToRisk(incident), affects: related ? [...new Set([...affects, ...candidateNames])] : affects };
    }).filter((incident) => incident.affects.length > 0);
    const incidentPortIds = listPorts().filter((port) => incidentsRaw.some((incident) => {
      const text = incident.title + incident.detail;
      return text.includes(port.name.replace("口岸", "")) || (port.id === "lok-ma-chau" && /落馬洲|福田口岸/.test(text));
    })).map((port) => port.id);
    const weather = withinHorizon ? context.weather.payload?.weather ?? null : null;
    const service = withinHorizon && portId ? serviceFromObservation(railObservationFor(context.conditions, portId)) : null;
    const estimate = portId ? estimateBorderQueue({
      portId, at,
      direction: crossing?.from.side === "sz" ? "sz_to_hk" : "hk_to_sz",
      weather, railDisrupted: service?.status === "disrupted",
      portIncident: withinHorizon && incidentPortIds.includes(portId),
      observations: withinHorizon ? relevantRows : [],
      quality: withinHorizon ? qualityForPort(context.conditions, portId) : "fixture",
    }) : undefined;
    const quality = withinHorizon ? worstQuality(context.weather.quality, context.traffic.quality, ...(portId ? [qualityForPort(context.conditions, portId)] : [])) : "fixture";
    const usedSources = context.conditions.sources.filter((source) => portId && source.id.startsWith(`port-${portId}-`) && source.quality !== "fixture");
    const notices = [context.weather.notice, context.traffic.notice, ...context.conditions.notices.filter((notice) => !portId || notice.startsWith(portId)),
      ...(!withinHorizon ? ["行程不在目前觀測適用的兩小時範圍，天氣／事件／班次不當作未來事實；排隊僅為時段先驗估算。"] : []),
      ...(portId && !findPort(portId)?.coordinatesVerified ? ["口岸時間已有來源核對，雙側座標仍未完整核實。"] : []),
    ];
    const urls = [context.weather.sourceUrl, context.traffic.sourceUrl, ...usedSources.map((source) => source.url)].filter((url): url is string => Boolean(url));
    const border = estimate?.signal ? { ...estimate.signal, note: [estimate.signal.note, ...notices, "來源：" + [...new Set(urls)].join("；")].join("；") } : null;
    const stampMs = [context.weather.updatedAt, context.traffic.updatedAt, ...usedSources.map((source) => Date.parse(source.updatedAt))].filter(Number.isFinite);
    const updatedAt = toHkIso(Math.min(...stampMs, now()));
    const expiresAt = toHkIso(Math.min(context.weather.expiresAt, context.traffic.expiresAt, now() + 120000, ...usedSources.map((source) => Date.parse(source.updatedAt) + 120000)));
    return {
      routeId: route.id,
      value: { weather: weather ? { condition: weather.condition, warning: weather.warning, updatedAt: weather.updatedAt } : null, incidents: withinHorizon ? incidents : [], border, service, quality },
      source: ["B 資料與估算（香港天文台／運輸署／口岸班次信號）", ...notices].join("；"),
      sourceUrl: usedSources[0]?.url ?? context.weather.sourceUrl,
      updatedAt, expiresAt,
      confidence: withinHorizon ? estimate?.confidence ?? (weather ? "medium" : "low") : "low",
      quality,
    };
  };
}
