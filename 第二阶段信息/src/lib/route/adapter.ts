/**
 * Route Adapter（成員 A 維護）——「出行／導航路徑讀取」的總入口。
 *
 * 職責：把「起點 + 終點 + 出發時間」變成**至少兩條候選路線**，並保證：
 *   1. 三退路：live → cached → fixture（沿用第一階段慣例）
 *   2. 任何一層失敗都不會讓 API 500 或前端白屏
 *   3. 每條候選都帶自己的 `quality`，fixture 不得偽裝成 live
 *   4. 結果決定性：同一查詢得到同一排序
 *
 * 為什麼要有 cache 這一層：路線查詢是外部呼叫，示範當天若供應商抖動，
 * 上一次成功的結果可以撐住演示；但必須標示為 `cached`，讓使用者知道不是最新。
 */
import { parseArriveBy } from "@/lib/time";
import { findPlace } from "@/lib/geo/places";
import type { JourneyMode } from "@/lib/types/journey";
import type {
  CandidateRoute,
  ProviderId,
  RawRoute,
  RouteProvider,
  RouteQuery,
  RouteResolution,
} from "@/lib/types/route";
import { RouteParseError, parseRawJourney } from "./parse";
import { createFixtureProvider } from "./providers/fixture";
import { createOsrmProvider } from "./providers/osrm";

export const DEFAULT_ROUTE_TIMEOUT_MS = 4000;
export const DEFAULT_ROUTE_CACHE_TTL_MS = 5 * 60_000;

export type RouteResolutionErrorCode =
  | "INVALID_DEPART_AT"
  /** 起點或終點無法對應到座標（沒有座標就無從查路線）。 */
  | "INVALID_COORDINATE"
  /** 指定的供應商不存在（設定錯誤，非資料問題）。 */
  | "CONFIG"
  | "NO_ROUTES"
  /** 供應商在逾時內沒有回應（與「上遊自己報錯」區分）。 */
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_FAILED";

export class RouteResolutionError extends Error {
  readonly code: RouteResolutionErrorCode;

  constructor(code: RouteResolutionErrorCode, message: string) {
    super(message);
    this.name = "RouteResolutionError";
    this.code = code;
  }
}

/**
 * 供應商逾時（我們自己計時的那一段）。
 *
 * 為什麼要獨立成一個型別：需要區分「上遊說這條路線算不出來」與
 * 「上遊根本沒回應」。前者可以信任它的結論，後者只能當成缺資料。
 */
export class ProviderTimeoutError extends Error {
  readonly providerId: ProviderId;

  constructor(providerId: ProviderId, timeoutMs: number) {
    super(`路線來源「${providerId}」在 ${timeoutMs} 毫秒內沒有回應。`);
    this.name = "ProviderTimeoutError";
    this.providerId = providerId;
  }
}

export interface RouteCacheLike {
  get(key: string): RawRoute[] | null;
  set(key: string, routes: RawRoute[]): void;
}

interface CacheEntry {
  routes: RawRoute[];
  storedAtMs: number;
}

/** 記憶體快取（含 TTL）。刻意不做持久化：本專案不引入資料庫。 */
export function createMemoryRouteCache(
  ttlMs = DEFAULT_ROUTE_CACHE_TTL_MS,
  now: () => number = Date.now,
): RouteCacheLike {
  const store = new Map<string, CacheEntry>();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (now() - entry.storedAtMs > ttlMs) {
        store.delete(key);
        return null;
      }
      return entry.routes;
    },
    set(key, routes) {
      store.set(key, { routes, storedAtMs: now() });
    },
  };
}

/**
 * 依環境變數決定可用的實時供應商。
 *
 * 刻意「預設為空」：與第一階段一致——沒有設定任何環境變數時，
 * 系統仍然完整可運行（走 fixture），不會因為外部服務而失敗。
 */
export function defaultRouteProviders(): RouteProvider[] {
  const baseUrl = process.env.ROUTE_OSRM_BASE_URL?.trim();
  if (!baseUrl) return [];
  return [createOsrmProvider({ baseUrl, profile: "walking" })];
}

export interface ResolveRoutesOptions {
  query: RouteQuery;
  /** 實時供應商；未提供時依環境變數決定。 */
  providers?: readonly RouteProvider[];
  /** 離線退路；未提供時使用內建 fixture 供應商。 */
  fixtureProvider?: RouteProvider;
  /**
   * 限制只使用這個供應商。找不到對應供應商時抛 `CONFIG`，
   * 而不是静静地換一個來源（那會讓使用者以為看到的是同一種資料）。
   */
  providerId?: ProviderId;
  timeoutMs?: number;
  cache?: RouteCacheLike;
  now?: () => number;
}

export interface RouteOutcome {
  resolution: RouteResolution;
  /** 這一輪實際命中的層級，供日誌與驗收斷言使用。 */
  tier: RouteResolution["tier"];
}

function cacheKey(query: RouteQuery): string {
  return [query.origin, query.destination, query.departAt, query.preferPortId ?? ""].join("|");
}

async function callProvider(
  provider: RouteProvider,
  query: RouteQuery,
  timeoutMs: number,
  outer: AbortSignal,
): Promise<RawRoute[] | null> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  outer.addEventListener("abort", onOuterAbort, { once: true });
  try {
    return await provider.fetch(query, controller.signal);
  } catch (error) {
    // 區分「我們計時逾時」與「上遊自己報錯」。
    if (timedOut) throw new ProviderTimeoutError(provider.id, timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    outer.removeEventListener("abort", onOuterAbort);
  }
}

function qualityOf(tier: RouteResolution["tier"]): RouteResolution["quality"] {
  if (tier === "live") return "live";
  if (tier === "cached") return "cached";
  return "fixture";
}

/**
 * 解析一組原始路線為候選路線。
 *
 * 解析失敗的路線不會讓整個請求失敗：只記錄 notice。
 * 這是刻意的——單一供應商的格式異常不該讓使用者看不到任何建議。
 */
function toCandidates(
  rawRoutes: readonly RawRoute[],
  notices: string[],
  query: RouteQuery,
): CandidateRoute[] {
  const candidates: CandidateRoute[] = [];
  const seen = new Set<string>();

  for (const raw of rawRoutes) {
    try {
      const { journey, notices: parseNotices } = parseRawJourney(raw.journey);
      notices.push(...parseNotices);

      // 去重：不同層級可能給出同一條路線（例如 live 與 fixture 都命中同一走廊）。
      const signature = `${journey.totalMinutes}|${journey.borderPortIds.join(",")}|${journey.segments
        .map((segment) => segment.mode)
        .join(",")}`;
      if (seen.has(signature)) continue;
      seen.add(signature);

      candidates.push({
        id: journey.id,
        label: journey.label,
        provider: raw.provider,
        quality: raw.quality,
        journey,
      });
      notices.push(...raw.notices);
    } catch (error) {
      const reason = error instanceof RouteParseError ? error.message : String(error);
      notices.push(`供應商 ${raw.provider} 的一條候選路線無法解析，已略過：${reason}`);
    }
  }

  const narrowed = applyFilters(candidates, query, notices);

  // 決定性排序：先比總時間，再比 id，避免平台差異造成順序不同。
  narrowed.sort((a, b) => {
    if (a.journey.totalMinutes !== b.journey.totalMinutes) {
      return a.journey.totalMinutes - b.journey.totalMinutes;
    }
    return a.id.localeCompare(b.id);
  });

  return narrowed;
}

/**
 * 套用查詢條件（口岸 / 交通方式）。
 *
 * 刻意設計成「篩選後不可以變成空集合」：過濾條件若把候選全部刪光，
 * 就保留原候選並回報，因為「一個建議都沒有」對使用者的傷害大於「給出不完全符合條件的建議」。
 */
function applyFilters(
  candidates: readonly CandidateRoute[],
  query: RouteQuery,
  notices: string[],
): CandidateRoute[] {
  let result = [...candidates];

  if (query.preferPortId) {
    const filtered = result.filter((candidate) =>
      candidate.journey.borderPortIds.includes(query.preferPortId ?? ""),
    );
    if (filtered.length > 0) {
      result = filtered;
    } else {
      notices.push(
        `沒有候選路線經過指定口岸「${query.preferPortId}」，已改為列出全部口岸的候選路線。`,
      );
    }
  }

  if (query.modes && query.modes.length > 0) {
    const allowed = query.modes;
    const filtered = result.filter((candidate) =>
      candidate.journey.segments.every((segment) => allowed.includes(segment.mode)),
    );
    if (filtered.length > 0) {
      result = filtered;
    } else {
      notices.push(
        `沒有候選路線完全符合指定的交通方式（${allowed.join("、")}），已改為列出全部候選路線。`,
      );
    }
  }

  return result;
}

/**
 * 取得候選路線。
 *
 * 回傳**至少兩條**候選（跨境走廊有三條），並保證至少一條可用；
 * 完全拿不到任何路線時才拋出 `NO_ROUTES`，讓 API 層轉成明確的錯誤回應。
 */
export async function resolveRoutes(options: ResolveRoutesOptions): Promise<RouteOutcome> {
  const { query } = options;
  const notices: string[] = [];

  const parsed = parseArriveBy(query.departAt);
  if (!parsed.ok) {
    throw new RouteResolutionError("INVALID_DEPART_AT", parsed.message);
  }
  const normalizedQuery: RouteQuery = { ...query, departAt: parsed.iso };

  // 座標驗證：「查不到座標」與「查不到走廊」是不同的錯誤，
  // 分開回報才能讓前端知道是輸入問題還是路線覆蓋範圍問題。
  if (!findPlace(normalizedQuery.origin) || !findPlace(normalizedQuery.destination)) {
    throw new RouteResolutionError(
      "INVALID_COORDINATE",
      `起點或終點無法對應到座標：${normalizedQuery.origin} → ${normalizedQuery.destination}。`,
    );
  }

  const cache = options.cache;
  const key = cacheKey(normalizedQuery);
  const configuredProviders = options.providers ?? defaultRouteProviders();
  const fixtureProvider = options.fixtureProvider ?? createFixtureProvider();
  const timeoutMs = options.timeoutMs ?? DEFAULT_ROUTE_TIMEOUT_MS;
  const abort = new AbortController();

  // 指定供應商時只使用它；找不到就抛 CONFIG，不静静地換來源。
  let providers = [...configuredProviders];
  if (options.providerId) {
    const match = [...configuredProviders, fixtureProvider].find(
      (provider) => provider.id === options.providerId,
    );
    if (!match) {
      throw new RouteResolutionError(
        "CONFIG",
        `找不到路線供應商「${options.providerId}」，請檢查供應商設定。`,
      );
    }
    providers = [match];
  }

  let rawRoutes: RawRoute[] | null = null;
  let tier: RouteResolution["tier"] = "fixture";

  // 第 1 層：快取（標示為 cached，不假裝是即時資料）。
  if (cache) {
    const hit = cache.get(key);
    if (hit) {
      rawRoutes = hit;
      tier = "cached";
      notices.push("使用先前取得的快取路線（cached），可能不是最新路況。");
    }
  }

  // 第 2 層：實時供應商。
  if (!rawRoutes) {
    for (const provider of providers) {
      try {
        const result = await callProvider(provider, normalizedQuery, timeoutMs, abort.signal);
        if (result && result.length > 0) {
          rawRoutes = result;
          tier = "live";
          cache?.set(key, result);
          break;
        }
      } catch (error) {
        if (error instanceof ProviderTimeoutError) {
          // 逾時：來源根本沒回應，只能當成缺資料。
          notices.push(`路線來源「${provider.id}」逾時未回應，已回退至下一層。`);
        } else {
          const reason = error instanceof Error ? error.message : String(error);
          notices.push(`路線來源「${provider.id}」失敗，已回退：${reason}`);
        }
      }
    }
  }

  // 第 3 層：離線 fixture。永遠是最後一道保險，保證斷網也能演示。
  if (!rawRoutes) {
    try {
      const result = await callProvider(fixtureProvider, normalizedQuery, timeoutMs, abort.signal);
      if (result && result.length > 0) {
        rawRoutes = result;
        tier = "fixture";
        if (providers.length > 0) {
          notices.push("未能取得實時路線，已回退至演示固定資料（fixture）。");
        } else {
          notices.push(
            "未設定實時路線來源（ROUTE_OSRM_BASE_URL），本次使用演示固定資料（fixture）。",
          );
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      notices.push(`離線路線來源失敗：${reason}`);
    }
  }

  if (!rawRoutes || rawRoutes.length === 0) {
    throw new RouteResolutionError(
      "NO_ROUTES",
      `找不到由「${query.origin}」到「${query.destination}」的候選路線。`,
    );
  }

  const candidates = toCandidates(rawRoutes, notices, normalizedQuery);
  if (candidates.length === 0) {
    throw new RouteResolutionError(
      "NO_ROUTES",
      "候選路線全部無法解析，請檢查供應商格式或地點設定。",
    );
  }

  const fetchedAt = candidates.length > 0 ? rawRoutes[0]?.fetchedAt ?? "" : "";

  return {
    tier,
    resolution: {
      query: normalizedQuery,
      candidates,
      quality: qualityOf(tier),
      tier,
      notices,
      fetchedAt,
    },
  };
}

/** 目前候選的供應商清單（供 UI 的「資料來源」面板使用）。 */
export function candidateProviders(candidates: readonly CandidateRoute[]): ProviderId[] {
  return [...new Set(candidates.map((candidate) => candidate.provider))];
}

/** 依交通方式篩選候選（路線模式 Fastest / Reliable 等的共用工具）。 */
export function filterByModes(
  candidates: readonly CandidateRoute[],
  modes: readonly JourneyMode[],
): CandidateRoute[] {
  return candidates.filter((candidate) =>
    candidate.journey.segments.every((segment) => modes.includes(segment.mode)),
  );
}
