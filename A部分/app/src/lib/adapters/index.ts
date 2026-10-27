/**
 * 資料適配層入口（成員 B / 成員 A 共同維護）。
 *
 * 三層回退鏈：live → cached → fixture。任何一層失敗都不會讓 API 500，
 * 也不會讓前端白屏；使用者會在 `notices` 與 `dataQuality` 看到實際使用的那一層。
 */
import { getFixtureSnapshot } from "@/lib/fixtures/context";
import { FIXTURE_COLLECTED_AT } from "@/lib/fixtures/context/snapshots";
import { isFixtureScenario, type ContextResolution, type ContextSnapshot, type Scenario } from "@/lib/types";
import { ROUTES } from "@/lib/corridor";
import { validateLivePayload } from "./validation";
import { toHkIso } from "@/lib/time";
import { snapshotCache, DEFAULT_CACHE_TTL_MS } from "./cache";
import { createLiveProviders } from "./live-providers";
import type { FallbackTier, LiveDataProvider, SnapshotCacheLike } from "./types";

export { SnapshotCache, snapshotCache, DEFAULT_CACHE_TTL_MS } from "./cache";
export { createLiveProviders, liveProvidersConfigured } from "./live-providers";
export type { FallbackTier, LiveDataPayload, LiveDataProvider } from "./types";

export const DEFAULT_LIVE_TIMEOUT_MS = 2500;

export interface ResolveContextOptions {
  scenario: Scenario;
  /** 注入時鐘，方便測試；預設為 Date.now。 */
  now?: () => number;
  timeoutMs?: number;
  /** 覆寫實時來源（測試用）。 */
  providers?: readonly LiveDataProvider[];
  cache?: SnapshotCacheLike;
}

export interface ResolvedContext {
  resolution: ContextResolution;
  tier: FallbackTier;
}

function fixtureFallback(scenario: Scenario, notices: string[]): ResolvedContext {
  if (isFixtureScenario(scenario)) {
    return {
      tier: "fixture_scenario",
      resolution: {
        snapshot: getFixtureSnapshot(scenario),
        quality: "fixture",
        notices,
      },
    };
  }
  notices.push(
    "未能取得實時資料，已回退至「正常通勤」演示固定資料（fixture）。請以畫面上的資料時間為準。",
  );
  return {
    tier: "fixture",
    resolution: { snapshot: getFixtureSnapshot("normal"), quality: "fixture", notices },
  };
}

/**
 * 取得某個情景的 ContextSnapshot。
 *
 * - `normal` / `heavy_rain` / `disruption`：直接使用對應 fixture（完全可重現）。
 * - `live`：嘗試實時來源 → 快取 → fixture。
 */
export async function resolveContextWithTier(
  options: ResolveContextOptions,
): Promise<ResolvedContext> {
  const {
    scenario,
    now = () => Date.now(),
    timeoutMs = DEFAULT_LIVE_TIMEOUT_MS,
    providers = createLiveProviders(),
    cache = snapshotCache,
  } = options;

  const notices: string[] = [];

  if (scenario !== "live") {
    return fixtureFallback(scenario, notices);
  }

  if (providers.length === 0) {
    notices.push(
      "未設定實時資料來源（HKO_OPEN_DATA_BASE_URL / TD_SPECIAL_TRAFFIC_NEWS_URL），本次使用演示固定資料。",
    );
    return fixtureFallback("live", notices);
  }

  try {
    const results = await fetchWithTimeout(providers, timeoutMs, notices);
    const merged = mergePayloads(results.map((r) => r.payload));
    if (!merged) {
      throw new Error("實時來源回傳空資料");
    }

    const collectedAt = toHkIso(now());
    const unknownRoutes = ROUTES.map((route) => ({ routeId: route.id, status: "unknown" as const, delayMinutes: 0, crowding: "unknown" as const, note: "交通狀態未核實；0 不是零延誤估計。", affectedSegments: [], updatedAt: collectedAt }));
    if (!merged.weather) throw new Error("缺少可核實的天氣資料");
    if (!merged.routes) notices.push("交通狀態未確認；延誤與擁擠程度未知，靜態路線時間仍為演示估算。");
    const snapshot: ContextSnapshot = {
      scenario: "live",
      serviceDate: collectedAt.slice(0, 10),
      collectedAt,
      // 新鮮度由來源更新時間與快取期限決定，回退不延長效期。
      expiresAt: toHkIso(Math.min(Date.parse(collectedAt) + DEFAULT_CACHE_TTL_MS, Date.parse(merged.weather.updatedAt) + 3600000, ...results.filter((r) => r.id === "mtr-next-train").flatMap((r) => (r.payload.routes ?? []).filter((route) => route.routeId !== "R2").map((route) => Date.parse(route.updatedAt) + 120000)))),
      quality: "live",
      weather: merged.weather,
      routes: merged.routes ?? unknownRoutes,
      incidents: merged.incidents ?? [],
      sources: [
        { id: "weather-live", label: "即時天氣", url: results.some((p) => p.id === "hko-weather") ? "https://data.weather.gov.hk/weatherAPI/opendata/weather.php" : null, quality: "live", updatedAt: merged.weather.updatedAt, note: "來源：" + results.filter((p) => p.payload.weather).map((p) => p.id).join(", ") },
        ...results.filter((r) => r.id !== "hko-weather" && !r.payload.weather).map((r) => ({ id: r.id, label: r.id === "mtr-next-train" ? "港鐵下一班抵站預測" : "運輸署走廊相關公告", url: r.id === "mtr-next-train" ? "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php" : r.id === "td-special-traffic-news" ? (process.env.TD_SPECIAL_TRAFFIC_NEWS_URL ?? null) : null, quality: "live" as const, updatedAt: r.payload.routes?.[0]?.updatedAt ?? collectedAt, note: "抵站／公告不是全程 ETA、擁擠預測或精確延誤" })),
        { id: "route-estimates", label: "靜態路線時間及費用", url: null, quality: "fixture", updatedAt: FIXTURE_COLLECTED_AT, note: "演示估算，非官方 ETA 或票價。交通狀態缺失時為 unknown。" },
      ],
    };

    cache.set("live", snapshot, now());
    return { tier: "live", resolution: { snapshot, quality: "live", notices } };
  } catch (error) {
    notices.push(
      `實時資料取得失敗（${describeError(error)}），已回退至上一層資料。`,
    );
  }

  const cached = cache.get("live", now());
  if (cached) {
    notices.push("本次使用快取資料；實際更新時間見資料來源。");
    return { tier: "cached", resolution: { snapshot: { ...cached, quality: "cached", sources: cached.sources.map((source) => ({ ...source, quality: source.quality === "live" ? "cached" : source.quality })) }, quality: "cached", notices } };
  }

  return fixtureFallback("live", notices);
}

/** 給 API 使用的簡化介面。 */
export async function resolveContext(options: ResolveContextOptions): Promise<ContextResolution> {
  const { resolution } = await resolveContextWithTier(options);
  return resolution;
}

async function fetchWithTimeout(
  providers: readonly LiveDataProvider[], timeoutMs: number, notices: string[],
) {
  const settled = await Promise.allSettled(providers.map(async (provider) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("逾時")); }, timeoutMs);
      });
      const payload = await Promise.race([Promise.resolve().then(() => provider.fetch(controller.signal)), deadline]);
      return payload === null ? null : { id: provider.id, payload: validateLivePayload(payload) };
    } finally { if (timer) clearTimeout(timer); }
  }));
  const successes: Array<{ id: string; payload: NonNullable<Awaited<ReturnType<LiveDataProvider["fetch"]>>> }> = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) successes.push(result.value);
    else notices.push(`${providers[index]!.id}：${result.status === "rejected" ? describeError(result.reason) : "沒有可用即時資料"}`);
  });
  if (!successes.length) throw new Error("全部實時來源失敗或沒有可用資料");
  return successes;
}

function mergePayloads(
  payloads: ReadonlyArray<Awaited<ReturnType<LiveDataProvider["fetch"]>>>,
) {
  const merged: NonNullable<Awaited<ReturnType<LiveDataProvider["fetch"]>>> = {};
  let hasData = false;
  for (const payload of payloads) {
    if (!payload) continue;
    hasData = true;
    if (payload.weather) merged.weather = { ...merged.weather, ...payload.weather };
    if (payload.routes) merged.routes = payload.routes;
    if (payload.incidents) merged.incidents = [...(merged.incidents ?? []), ...payload.incidents];
  }
  return hasData ? merged : null;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "AbortError" ? "逾時" : error.message;
  }
  return String(error);
}

/** 讓測試與 health 端點知道 fixture 的固定擷取時間。 */
export const FIXTURE_UPDATED_AT = FIXTURE_COLLECTED_AT;
