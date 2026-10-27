/**
 * B 在正式組合層的注入實作測試（成員 B）。
 *
 * 全部**不連網**：天氣／公告來源與口岸觀測的 fetch 都注入。
 */
import { describe, expect, it, vi } from "vitest";
import { createFixtureProvider } from "@/lib/route/providers/fixture";
import { parseRawJourney } from "@/lib/route/parse";
import { createRouteDataResolver, serviceFromObservation, teamLiveDataEnabled, worstQuality } from "@/lib/adapters/team-data";
import { PortConditionClient, type PortObservation } from "@/lib/adapters/port-conditions";
import type { CandidateRoute } from "@/lib/types/route";
import type { TeamJourneyRequest } from "@/lib/types/team-integration";
import type { LiveDataProvider } from "@/lib/adapters/types";

const T0800 = "2026-10-13T08:00:00+08:00";
const NOW = Date.parse(T0800);

const request: TeamJourneyRequest = {
  origin: "central-exchange-square",
  destination: "futian-station-sz",
  departAt: T0800,
  mode: "balanced",
};

async function crossBorderCandidates(): Promise<CandidateRoute[]> {
  const provider = createFixtureProvider();
  const raw = await provider.fetch(request, new AbortController().signal);
  return (raw ?? []).map((route) => {
    const { journey } = parseRawJourney(route.journey);
    return { id: journey.id, label: journey.label, provider: route.provider, quality: route.quality, journey };
  });
}

/** 一個"所有路線都在跑"的假上游：每條路線/方向都有班次，且沒有延誤旗標。 */
function fakeUpstream(options: { isdelay?: "Y" | "N" } = {}) {
  const rows = [
    ["B3X", "I", ["08:10", "08:30"]],
    ["B3", "I", ["08:05", "08:35"]],
    ["B3M", "O", ["08:15", "08:45"]],
    ["B7", "I", ["08:12", "08:32"]],
    ["B8", "I", ["08:18", "08:48"]],
    ["B1", "I", ["08:20", "08:40"]],
    ["B9", "I", ["08:22", "08:52"]],
  ].flatMap(([route, dir, times]) =>
    (times as string[]).map((time) => ({
      co: "CTB",
      route,
      dir,
      stop: "000000",
      eta: `2026-10-13T${time}:00+08:00`,
      rmk_tc: "",
      data_timestamp: "2026-10-13T08:00:00+08:00",
    })),
  );
  return vi.fn(async (url: string | URL) => {
    const href = String(url);
    if (href.includes("getSchedule")) {
      const payload = {
        ...(options.isdelay ? { isdelay: options.isdelay } : {}),
        data: {
          "EAL-LMC": { curr_time: "2026-10-13 08:00:00", DOWN: [{ dest: "ADM", time: "2026-10-13 08:12:00", plat: "1" }, { dest: "ADM", time: "2026-10-13 08:24:00", plat: "1" }] },
          "EAL-LOW": { curr_time: "2026-10-13 08:00:00", DOWN: [{ dest: "ADM", time: "2026-10-13 08:08:00", plat: "1" }, { dest: "ADM", time: "2026-10-13 08:16:00", plat: "1" }] },
        },
      };
      return new Response(JSON.stringify(payload), { status: 200 });
    }
    return new Response(JSON.stringify({ generated_timestamp: "2026-10-13T08:00:00+08:00", data: rows }), { status: 200 });
  }) as unknown as typeof fetch;
}

const weatherStub: LiveDataProvider = {
  id: "hko-weather",
  provides: ["weather"],
  fetch: async () => ({
    weather: {
      condition: "clear",
      warning: null,
      rainfallMmPerHour: null,
      temperatureC: 27,
      updatedAt: "2026-10-13T08:00:00+08:00",
      note: null,
    },
  }),
};
const emptyTrafficStub: LiveDataProvider = { id: "td-special-traffic-news", provides: ["incidents"], fetch: async () => ({ incidents: [] }) };

function resolver(options: { enabled?: boolean; isdelay?: "Y" | "N"; client?: PortConditionClient } = {}) {
  const client = options.client ?? new PortConditionClient({ fetcher: fakeUpstream({ isdelay: options.isdelay }), now: () => NOW });
  return createRouteDataResolver({
    client,
    now: () => NOW,
    env: options.enabled ? { HKO_OPEN_DATA_BASE_URL: "https://data.weather.gov.hk/x" } : {},
    weatherProvider: options.enabled ? weatherStub : null,
    trafficProvider: options.enabled ? emptyTrafficStub : null,
  });
}

describe("啟用條件", () => {
  it("沒有任何實時來源環境變數時，判定為未啟用", () => {
    expect(teamLiveDataEnabled({})).toBe(false);
  });

  it("任一來源設定即啟用", () => {
    expect(teamLiveDataEnabled({ MTR_NEXT_TRAIN_ENABLED: "1" })).toBe(true);
    expect(teamLiveDataEnabled({ TEAM_LIVE_DATA_ENABLED: "1" })).toBe(true);
    expect(teamLiveDataEnabled({ TD_SPECIAL_TRAFFIC_NEWS_URL: "https://x" })).toBe(true);
  });

  it("未啟用時一律回 null——不用 fixture 冒充正式資料", async () => {
    const resolve = resolver({ enabled: false });
    const [route] = await crossBorderCandidates();
    expect(await resolve(route!, request)).toBeNull();
  });
});

describe("正式注入：情境資料", () => {
  it("跨境候選會拿到口岸排隊區間，且必須標明是估算", async () => {
    const resolve = resolver({ enabled: true });
    const routes = await crossBorderCandidates();
    const envelope = await resolve(routes[0]!, request);
    expect(envelope).not.toBeNull();
    expect(envelope!.routeId).toBe(routes[0]!.id);
    expect(envelope!.value.border).not.toBeNull();
    expect(envelope!.value.border!.queueMinutesRange[1]).toBeGreaterThanOrEqual(envelope!.value.border!.queueMinutesRange[0]);
    expect(envelope!.value.border!.note).toContain("估算");
    expect(["low", "medium"]).toContain(envelope!.value.border!.confidence);
  });

  it("置信度永遠不會是 high（間接代理不可能高信心）", async () => {
    const resolve = resolver({ enabled: true });
    for (const route of await crossBorderCandidates()) {
      const envelope = await resolve(route, request);
      expect(envelope!.confidence).not.toBe("high");
      expect(envelope!.value.border!.confidence).not.toBe("high");
    }
  });

  it("帶上天氣與交通公告，並標明來源", async () => {
    const resolve = resolver({ enabled: true });
    const [route] = await crossBorderCandidates();
    const envelope = await resolve(route!, request);
    expect(envelope!.value.weather!.condition).toBe("clear");
    expect(envelope!.value.incidents).toEqual([]);
    expect(envelope!.source).toContain("香港天文台");
    expect(Date.parse(envelope!.expiresAt)).toBeGreaterThan(Date.parse(envelope!.updatedAt));
  });

  it("港鐵有延誤旗標才報 delayed；沒有旗標如實報 unknown，絕不報 ok", async () => {
    const delayed = resolver({ enabled: true, isdelay: "Y" });
    const normal = resolver({ enabled: true, isdelay: "N" });
    const routes = await crossBorderCandidates();
    const railRoute = routes.find((route) => route.journey.borderPortIds.includes("lo-wu"))!;
    expect((await delayed(railRoute, request))!.value.service!.status).toBe("delayed");
    expect((await normal(railRoute, request))!.value.service!.status).toBe("unknown");
  });

  it("同一請求只抓一次上游（多條候選共用同一份情境）", async () => {
    const fetcher = fakeUpstream();
    const client = new PortConditionClient({ fetcher, now: () => NOW });
    const resolve = resolver({ enabled: true, client });
    const routes = await crossBorderCandidates();
    await Promise.all(routes.map((route) => resolve(route, request)));
    const callsAfter = (fetcher as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await resolve(routes[0]!, request);
    expect((fetcher as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(callsAfter);
  });

  it("結果決定性：同一輸入得到同一輸出", async () => {
    const routes = await crossBorderCandidates();
    const first = await resolver({ enabled: true })(routes[0]!, request);
    const second = await resolver({ enabled: true })(routes[0]!, request);
    expect(first).toEqual(second);
  });
});

describe("輔助函式", () => {
  it("品質取最差者，fixture 不會被 live 蓋掉", () => {
    expect(worstQuality("live", "fixture")).toBe("fixture");
    expect(worstQuality("live", "cached")).toBe("cached");
    expect(worstQuality("live", "live")).toBe("live");
  });

  it("沒有觀測或只有 fixture 觀測時，不提供服務狀態", () => {
    expect(serviceFromObservation(undefined)).toBeNull();
    expect(serviceFromObservation({ quality: "fixture", delayReported: true, updatedAt: T0800 } as PortObservation)).toBeNull();
    expect(serviceFromObservation({ quality: "live", delayReported: null, updatedAt: T0800 } as PortObservation)).toBeNull();
  });
});
