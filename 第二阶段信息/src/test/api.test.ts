import { describe, expect, it } from "vitest";
import { resolveContextWithTier, SnapshotCache } from "@/lib/adapters";
import { DEMO_REQUEST } from "@/lib/fixtures/demo-request";
import { getFixtureSnapshot } from "@/lib/fixtures/context";
import type { LiveDataPayload, LiveDataProvider } from "@/lib/adapters";
import { handleDecisionRequest } from "@/lib/api/decision-handler";
import { apiError, isApiErrorBody } from "@/lib/api/errors";
import { buildHealthResponse } from "@/lib/api/health-handler";
import type { ContextResolution } from "@/lib/types";

const fixtureResolution = (scenario: "normal" | "heavy_rain" | "disruption"): ContextResolution => ({
  snapshot: getFixtureSnapshot(scenario),
  quality: "fixture",
  notices: [],
});

describe("POST /api/decision", () => {
  it("回傳 200 與結構化的 DecisionResponse", async () => {
    const result = await handleDecisionRequest(
      { ...DEMO_REQUEST, scenario: "normal" },
      { resolveContext: async () => fixtureResolution("normal") },
    );
    expect(result.status).toBe(200);
    expect(isApiErrorBody(result.body)).toBe(false);
    if (isApiErrorBody(result.body)) return;
    expect(result.body.status).toBe("ready");
    expect(result.body.dataQuality).toBe("fixture");
    expect(result.body.primaryRoute.length).toBeGreaterThan(0);
  });

  it("依 scenario 回傳對應的 fixture 結果", async () => {
    const seen: string[] = [];
    const scenarios = ["normal", "heavy_rain", "disruption"] as const;
    const results = [];
    for (const scenario of scenarios) {
      results.push(
        await handleDecisionRequest(
          { ...DEMO_REQUEST, scenario },
          {
            resolveContext: async ({ scenario: requested }) => {
              seen.push(requested);
              return fixtureResolution(scenario);
            },
          },
        ),
      );
    }
    expect(seen).toEqual(["normal", "heavy_rain", "disruption"]);
    const primaries = results.map((result) =>
      isApiErrorBody(result.body) ? null : result.body.primaryPlan?.routeId,
    );
    expect(primaries).toEqual(["R1", "R1", "R2"]);
  });

  it("無效輸入回傳 400 INVALID_INPUT 與可讀訊息", async () => {
    const result = await handleDecisionRequest({ ...DEMO_REQUEST, arriveBy: "" });
    expect(result.status).toBe(400);
    expect(isApiErrorBody(result.body)).toBe(true);
    if (!isApiErrorBody(result.body)) return;
    expect(result.body.error.code).toBe("INVALID_INPUT");
    expect(result.body.error.details.length).toBeGreaterThan(0);
  });

  it("非物件輸入回傳 400 而不是拋出例外", async () => {
    for (const input of [null, undefined, "hello", 42, []]) {
      const result = await handleDecisionRequest(input);
      expect(result.status).toBe(400);
    }
  });

  it("未開啟故障注入時，faultInjection 欄位被忽略", async () => {
    const result = await handleDecisionRequest(
      { ...DEMO_REQUEST, faultInjection: "internal_error" },
      { allowFaultInjection: false, resolveContext: async () => fixtureResolution("normal") },
    );
    expect(result.status).toBe(200);
  });

  it("開啟故障注入時可模擬後端失敗（用於離線演示與測試）", async () => {
    const result = await handleDecisionRequest(
      { ...DEMO_REQUEST, faultInjection: "internal_error" },
      { allowFaultInjection: true },
    );
    expect(result.status).toBe(500);
    expect(isApiErrorBody(result.body)).toBe(true);
    if (!isApiErrorBody(result.body)) return;
    expect(result.body.error.code).toBe("INTERNAL_ERROR");
  });

  it("快照解析失敗時回傳 500 INTERNAL_ERROR，而不是讓請求崩潰", async () => {
    const result = await handleDecisionRequest(DEMO_REQUEST, {
      resolveContext: async () => {
        throw new Error("模擬上游逾時");
      },
    });
    expect(result.status).toBe(500);
    expect(isApiErrorBody(result.body)).toBe(true);
    if (!isApiErrorBody(result.body)) return;
    expect(result.body.error.details.join(" ")).toContain("模擬上游逾時");
  });

  it("unavailable 是 200 的有效決策結果，而不是 HTTP 錯誤", async () => {
    const result = await handleDecisionRequest(
      { ...DEMO_REQUEST, arriveBy: "2026-10-13T05:45" },
      { resolveContext: async () => fixtureResolution("normal") },
    );
    expect(result.status).toBe(200);
    if (isApiErrorBody(result.body)) return;
    expect(result.body.status).toBe("unavailable");
    expect(result.body.reasons.length).toBeGreaterThan(0);
  });
});

describe("資料適配層的回退鏈", () => {
  const failingProvider: LiveDataProvider = {
    id: "failing",
    provides: ["weather"],
    fetch: async () => {
      throw new Error("上游 503");
    },
  };

  const silentProvider: LiveDataProvider = {
    id: "silent",
    provides: ["weather"],
    fetch: async () => null,
  };

  it("非 live 情景直接使用 fixture，不呼叫任何實時來源", async () => {
    let called = false;
    const { tier, resolution } = await resolveContextWithTier({
      scenario: "heavy_rain",
      providers: [
        {
          id: "spy",
          provides: ["weather"],
          fetch: async () => {
            called = true;
            return null;
          },
        },
      ],
    });
    expect(called).toBe(false);
    expect(tier).toBe("fixture_scenario");
    expect(resolution.quality).toBe("fixture");
    expect(resolution.notices).toEqual([]);
  });

  it("live 情景沒有來源可用時回退到 fixture 並說明原因", async () => {
    const { tier, resolution } = await resolveContextWithTier({
      scenario: "live",
      providers: [],
    });
    expect(tier).toBe("fixture");
    expect(resolution.quality).toBe("fixture");
    expect(resolution.notices.join(" ")).toContain("未設定實時資料來源");
  });

  it("實時來源全部失敗時回退到 fixture，且不拋出例外", async () => {
    const { tier, resolution } = await resolveContextWithTier({
      scenario: "live",
      providers: [failingProvider, silentProvider],
      cache: new SnapshotCache(),
    });
    expect(tier).toBe("fixture");
    expect(resolution.quality).toBe("fixture");
    expect(resolution.notices.join(" ")).toContain("實時資料取得失敗");
  });

  it("實時來源逾時會被中止並回退", async () => {
    const hangProvider: LiveDataProvider = {
      id: "hang",
      provides: ["weather"],
      fetch: (signal) =>
        new Promise<LiveDataPayload | null>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    };
    const { tier, resolution } = await resolveContextWithTier({
      scenario: "live",
      providers: [hangProvider],
      timeoutMs: 30,
      cache: new SnapshotCache(),
    });
    expect(tier).toBe("fixture");
    expect(resolution.notices.join(" ")).toContain("失敗");
  });

  it("有快取時，實時失敗會回退到 cached 而不是 fixture", async () => {
    const cache = new SnapshotCache();
    const now = () => Date.parse("2026-10-13T07:30:00+08:00");
    cache.set("live", { ...getFixtureSnapshot("normal"), quality: "live", scenario: "live" }, now());

    const { tier, resolution } = await resolveContextWithTier({
      scenario: "live",
      providers: [failingProvider],
      cache,
      now,
    });
    expect(tier).toBe("cached");
    expect(resolution.quality).toBe("cached");
    expect(resolution.notices.join(" ")).toContain("快取");
  });

  it("實時來源成功時標示為 live，且帶上真實擷取時間", async () => {
    const cache = new SnapshotCache();
    const now = () => Date.parse("2026-10-13T08:05:00+08:00");
    const provider: LiveDataProvider = {
      id: "ok",
      provides: ["weather"],
      fetch: async () => ({
        weather: {
          condition: "rain",
          warning: "黃色暴雨警告信號",
          rainfallMmPerHour: 12,
          temperatureC: 26,
          note: "實時測試資料",
          updatedAt: "2026-10-13T08:05:00+08:00",
        },
      }),
    };
    const { tier, resolution } = await resolveContextWithTier({
      scenario: "live",
      providers: [provider],
      cache,
      now,
    });
    expect(tier).toBe("live");
    expect(resolution.quality).toBe("live");
    expect(resolution.snapshot.collectedAt).toBe("2026-10-13T08:05:00+08:00");
    expect(resolution.snapshot.weather.warning).toBe("黃色暴雨警告信號");
    expect(cache.size).toBe(1);
  });

  it("快取超過 TTL 後不再使用", () => {
    const cache = new SnapshotCache(1000);
    const snapshot = { ...getFixtureSnapshot("normal"), quality: "live" as const };
    cache.set("live", snapshot, 0);
    expect(cache.get("live", 500)).not.toBeNull();
    expect(cache.get("live", 2000)).toBeNull();
  });
});

describe("GET /api/health", () => {
  it("回傳狀態、版本與時間", () => {
    const health = buildHealthResponse({
      version: "9.9.9",
      now: () => Date.parse("2026-10-13T07:30:00+08:00"),
      uptimeSeconds: 12,
    });
    expect(health.status).toBe("ok");
    expect(health.version).toBe("9.9.9");
    expect(health.time).toBe("2026-10-13T07:30:00+08:00");
    expect(health.uptimeSeconds).toBe(12);
    expect(health.scenarios).toEqual(["normal", "heavy_rain", "disruption"]);
    expect(health.fixtures.normal.quality).toBe("fixture");
    expect(health.corridor.id).toBe("tko-hang-hau-to-central");
  });

  it("每個情景都回報自己的資料擷取時間", () => {
    const health = buildHealthResponse();
    for (const scenario of health.scenarios) {
      expect(health.fixtures[scenario].collectedAt).toBe("2026-10-13T07:30:00+08:00");
    }
  });
});

describe("API 錯誤結構", () => {
  it("錯誤物件形狀穩定且可辨識", () => {
    const error = apiError("INVALID_INPUT", "格式錯誤", ["欄位 a 有問題"]);
    expect(isApiErrorBody(error)).toBe(true);
    expect(error.error.code).toBe("INVALID_INPUT");
    expect(error.error.details).toEqual(["欄位 a 有問題"]);
    expect(isApiErrorBody({ message: "not an api error" })).toBe(false);
    expect(isApiErrorBody({ error: { code: "NOPE" } })).toBe(false);
  });
});
