/**
 * 跨境路線讀取端到端測試（重點工作流）。
 *
 * 守住四件事：
 *   1. 跨境行程一定有 `border_crossing` 路段、綁定正確口岸
 *   2. 排隊時間是**區間 + 置信度**，不是假精確的單點值
 *   3. 三退路：live → cached → fixture，任何一層失敗都還有建議
 *   4. 決定性：同一查詢得到同一排序
 */
import { describe, expect, it } from "vitest";
import {
  RouteResolutionError,
  createMemoryRouteCache,
  resolveRoutes,
} from "@/lib/route/adapter";
import { createFixtureProvider } from "@/lib/route/providers/fixture";
import { borderSegments } from "@/lib/types/journey";
import type { RawRoute, RouteProvider, RouteQuery } from "@/lib/types/route";

const DEPART = "2026-10-13T08:00";

function crossBorderQuery(extra: Partial<RouteQuery> = {}): RouteQuery {
  return {
    origin: "central-exchange-square",
    destination: "futian-station-sz",
    departAt: DEPART,
    ...extra,
  };
}

/** 模擬一個成功的實時供應商（真實環境下是 OSRM 或其他官方來源）。 */
function liveProvider(options: { onCall?: () => void } = {}): RouteProvider {
  const route: RawRoute = {
    provider: "corridor",
    quality: "live",
    journey: {
      id: "live-express",
      label: "實時快線",
      departAt: "2026-10-13T08:00:00+08:00",
      steps: [
        {
          mode: "mtr",
          line: "東鐵線",
          from: { name: "金鐘站", lat: 22.279, lon: 114.165 },
          to: { name: "落馬洲站", lat: 22.5145, lon: 114.0656 },
          durationMinutes: 40,
          geometry: [
            [114.165, 22.279],
            [114.0656, 22.5145],
          ],
        },
        {
          mode: "walk",
          line: null,
          from: { name: "落馬洲站", lat: 22.5145, lon: 114.0656 },
          to: { name: "福田口岸", lat: 22.519, lon: 114.068 },
          durationMinutes: 10,
          geometry: [
            [114.0656, 22.5145],
            [114.068, 22.519],
          ],
        },
      ],
    },
    fetchedAt: "2026-10-13T07:59:00+08:00",
    notices: ["實時路線來源：測試替身。"],
  };
  return {
    id: "corridor",
    provides: "journey",
    async fetch() {
      options.onCall?.();
      return [route];
    },
  };
}

describe("跨境路線讀取（預設離線環境）", () => {
  it("無任何環境變數時仍能取得候選路線，且標示為 fixture", async () => {
    const { resolution, tier } = await resolveRoutes({ query: crossBorderQuery() });
    expect(tier).toBe("fixture");
    expect(resolution.quality).toBe("fixture");
    expect(resolution.candidates.length).toBeGreaterThanOrEqual(3);
    expect(resolution.notices.some((notice) => notice.includes("fixture"))).toBe(true);
  });

  it("每條候選都是跨境行程，並綁定一個口岸", async () => {
    const { resolution } = await resolveRoutes({ query: crossBorderQuery() });
    for (const candidate of resolution.candidates) {
      expect(candidate.journey.crossesBorder).toBe(true);
      expect(candidate.journey.borderPortIds.length).toBeGreaterThan(0);
      const crossings = borderSegments(candidate.journey);
      expect(crossings.length).toBeGreaterThan(0);
      expect(crossings[0]?.kind).toBe("border_crossing");
    }
  });

  it("三條候選分別經過落馬洲、羅湖與深圳灣口岸", async () => {
    const { resolution } = await resolveRoutes({ query: crossBorderQuery() });
    const ports = resolution.candidates.map((candidate) => candidate.journey.borderPortIds[0]);
    expect(ports).toEqual(["lok-ma-chau", "lo-wu", "shenzhen-bay"]);
  });

  it("候選依總時間升序排列（最快在前）", async () => {
    const { resolution } = await resolveRoutes({ query: crossBorderQuery() });
    const totals = resolution.candidates.map((candidate) => candidate.journey.totalMinutes);
    const sorted = [...totals].sort((a, b) => a - b);
    expect(totals).toEqual(sorted);
  });

  it("通關排隊時間是區間加置信度，不是假精確的單點值", async () => {
    const { resolution } = await resolveRoutes({ query: crossBorderQuery() });
    for (const candidate of resolution.candidates) {
      const crossing = borderSegments(candidate.journey)[0];
      const queue = crossing?.border;
      expect(queue).toBeDefined();
      expect(queue?.queueMinutesRange[0]).toBeLessThan(queue?.queueMinutesRange[1] ?? 0);
      expect(["high", "medium", "low"]).toContain(queue?.confidence);
      expect(queue?.note ?? "").toContain("估算");
    }
  });

  it("香港境內走廊不會被誤判為跨境", async () => {
    const { resolution } = await resolveRoutes({
      query: {
        origin: "hang-hau-estate",
        destination: "central-exchange-square",
        departAt: DEPART,
      },
    });
    const candidate = resolution.candidates[0];
    expect(candidate?.journey.crossesBorder).toBe(false);
    expect(candidate?.journey.borderPortIds).toEqual([]);
    expect(candidate?.journey.segments.every((segment) => segment.kind === "in_hk")).toBe(true);
  });

  it("路段時間連續：後一段的出發等於前一段的抵達", async () => {
    const { resolution } = await resolveRoutes({ query: crossBorderQuery() });
    const journey = resolution.candidates[0]?.journey;
    const segments = journey?.segments ?? [];
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index]?.departAt).toBe(segments[index - 1]?.arriveAt);
    }
    const total = segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);
    expect(journey?.totalMinutes).toBe(total);
  });
});

describe("換口岸（跨境 Plan B 的核心能力）", () => {
  it("指定口岸時只回傳經過該口岸的候選", async () => {
    const { resolution } = await resolveRoutes({
      query: crossBorderQuery({ preferPortId: "lo-wu" }),
    });
    expect(resolution.candidates.length).toBe(1);
    expect(resolution.candidates[0]?.journey.borderPortIds).toEqual(["lo-wu"]);
  });

  it("指定不存在或無候選的口岸時，仍給出建議並說明", async () => {
    const { resolution } = await resolveRoutes({
      query: crossBorderQuery({ preferPortId: "man-kam-to" }),
    });
    expect(resolution.candidates.length).toBeGreaterThan(0);
    expect(resolution.notices.some((notice) => notice.includes("man-kam-to"))).toBe(true);
  });
});

describe("三退路：live → cached → fixture", () => {
  it("實時供應商成功時使用 live 並標示來源", async () => {
    const { resolution, tier } = await resolveRoutes({
      query: crossBorderQuery(),
      providers: [liveProvider()],
    });
    expect(tier).toBe("live");
    expect(resolution.quality).toBe("live");
    expect(resolution.candidates[0]?.quality).toBe("live");
    expect(resolution.candidates[0]?.journey.crossesBorder).toBe(true);
  });

  it("實時供應商逾時或失敗時回退 fixture，並保留候選路線", async () => {
    const failing: RouteProvider = {
      id: "corridor",
      provides: "journey",
      async fetch() {
        throw new Error("模擬逾時");
      },
    };
    const { resolution, tier } = await resolveRoutes({
      query: crossBorderQuery(),
      providers: [failing],
    });
    expect(tier).toBe("fixture");
    expect(resolution.candidates.length).toBeGreaterThanOrEqual(3);
    expect(resolution.notices.some((notice) => notice.includes("失敗"))).toBe(true);
  });

  it("實時供應商回傳空結果時同樣回退 fixture", async () => {
    const empty: RouteProvider = {
      id: "corridor",
      provides: "journey",
      async fetch() {
        return null;
      },
    };
    const { tier } = await resolveRoutes({ query: crossBorderQuery(), providers: [empty] });
    expect(tier).toBe("fixture");
  });

  it("第二次查詢命中快取，且不再呼叫供應商", async () => {
    let calls = 0;
    const cache = createMemoryRouteCache(60_000);
    const query = crossBorderQuery();

    const first = await resolveRoutes({ query, providers: [liveProvider({ onCall: () => (calls += 1) })], cache });
    expect(first.tier).toBe("live");

    const second = await resolveRoutes({ query, providers: [liveProvider({ onCall: () => (calls += 1) })], cache });
    expect(second.tier).toBe("cached");
    expect(second.resolution.quality).toBe("cached");
    expect(calls).toBe(1);
    expect(second.resolution.notices.some((notice) => notice.includes("快取"))).toBe(true);
  });

  it("過期的快取不會被使用", async () => {
    let clock = 0;
    const cache = createMemoryRouteCache(1000, () => clock);
    const query = crossBorderQuery();

    await resolveRoutes({ query, providers: [liveProvider()], cache });
    clock = 5000;
    const { tier } = await resolveRoutes({ query, providers: [liveProvider()], cache });
    expect(tier).toBe("live");
  });
});

describe("錯誤碼分類（已合併 routing-service 的能力）", () => {
  it("起點或終點無法對應座標時回報 INVALID_COORDINATE", async () => {
    try {
      await resolveRoutes({
        query: { origin: "不存在的地點", destination: "福田", departAt: DEPART },
      });
      throw new Error("應該要拋出錯誤");
    } catch (error) {
      expect(error).toBeInstanceOf(RouteResolutionError);
      expect((error as RouteResolutionError).code).toBe("INVALID_COORDINATE");
    }
  });

  it("指定不存在的供應商時回報 CONFIG，而不是静静換一個來源", async () => {
    try {
      await resolveRoutes({
        query: crossBorderQuery(),
        providers: [liveProvider()],
        providerId: "osrm",
      });
      throw new Error("應該要拋出錯誤");
    } catch (error) {
      expect(error).toBeInstanceOf(RouteResolutionError);
      expect((error as RouteResolutionError).code).toBe("CONFIG");
    }
  });

  it("指定存在的供應商時只使用它", async () => {
    const { tier } = await resolveRoutes({
      query: crossBorderQuery(),
      providers: [liveProvider()],
      providerId: "corridor",
    });
    expect(tier).toBe("live");
  });

  it("供應商逾時被標記為逾時，與上遊報錯區分", async () => {
    const hanging: RouteProvider = {
      id: "corridor",
      provides: "journey",
      fetch: (_query, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    };

    const { resolution, tier } = await resolveRoutes({
      query: crossBorderQuery(),
      providers: [hanging],
      timeoutMs: 10,
    });

    expect(tier).toBe("fixture");
    expect(resolution.notices.some((notice) => notice.includes("逾時未回應"))).toBe(true);
    expect(resolution.candidates.length).toBeGreaterThanOrEqual(3);
  });
});

describe("錯誤處理與決定性", () => {
  it("出發時間無法解析時給出明確錯誤", async () => {
    await expect(
      resolveRoutes({ query: crossBorderQuery({ departAt: "昨天下午" }) }),
    ).rejects.toBeInstanceOf(RouteResolutionError);
  });

  it("沒有對應走廊時回報 NO_ROUTES，而不是回傳空陣列", async () => {
    try {
      await resolveRoutes({
        query: { origin: "central-exchange-square", destination: "華強北", departAt: DEPART },
      });
      throw new Error("應該要拋出錯誤");
    } catch (error) {
      expect(error).toBeInstanceOf(RouteResolutionError);
      expect((error as RouteResolutionError).code).toBe("NO_ROUTES");
    }
  });

  it("同一查詢重複執行得到完全相同的候選", async () => {
    const first = await resolveRoutes({ query: crossBorderQuery() });
    const second = await resolveRoutes({ query: crossBorderQuery() });
    expect(first.resolution.candidates).toEqual(second.resolution.candidates);
  });

  it("注入固定服務日與時間的 fixture 供應商可完全重現", async () => {
    const provider = createFixtureProvider({ serviceDate: "2026-10-13", departMinutes: 9 * 60 });
    const { resolution } = await resolveRoutes({
      query: crossBorderQuery({ departAt: "2026-10-13T09:00" }),
      providers: [],
      fixtureProvider: provider,
    });
    expect(resolution.candidates[0]?.journey.departAt).toBe("2026-10-13T09:00:00+08:00");
  });
});
