/**
 * 口岸條件與排隊估算的單元測試（成員 B）。
 *
 * 全部**不連網**：fetch 與時鐘一律注入，時間固定，結果可重現。
 */
import { describe, expect, it, vi } from "vitest";
import { listPorts } from "@/lib/geo/ports";
import {
  PortConditionClient,
  PORT_SIGNAL_SOURCES,
  collectPortObservations,
  estimateBorderQueue,
  headwayMinutes,
  signalSourcesFor,
  sourceUrlOf,
  type PortObservation,
} from "@/lib/adapters/port-conditions";

const T0800 = "2026-10-13T08:00:00+08:00"; // 週二，北向早高峰
const T2300 = "2026-10-13T23:00:00+08:00"; // 深夜
const T0800_SAT = "2026-10-17T08:00:00+08:00"; // 週六

/** 固定的「現在」：與測試時間同一天，避免跨日不穩。 */
const NOW = Date.parse(T0800);

function liveObservation(overrides: Partial<PortObservation> = {}): PortObservation {
  return {
    portId: "lo-wu",
    sourceId: "mtr-eal-low",
    label: "港鐵東鐵線 羅湖站",
    sourceUrl: sourceUrlOf(PORT_SIGNAL_SOURCES["lo-wu"]![0]!),
    observedHeadwayMinutes: 7,
    typicalHeadwayMinutes: 6,
    delayReported: null,
    arrivals: [T0800],
    updatedAt: T0800,
    quality: "live",
    note: null,
    ...overrides,
  };
}

describe("口岸信號註冊表", () => {
  it("為每個註冊口岸都定義了信號（可以是空陣列，代表確實沒有公開來源）", () => {
    for (const port of listPorts()) {
      expect(PORT_SIGNAL_SOURCES).toHaveProperty(port.id);
    }
  });

  it("沒有公開 ETA 的口岸如實留空，不用其他口岸的班次冒充", () => {
    expect(signalSourcesFor("huanggang")).toHaveLength(0);
    expect(signalSourcesFor("man-kam-to")).toHaveLength(0);
  });

  it("每個信號來源都能產生可追溯的官方 URL", () => {
    for (const sources of Object.values(PORT_SIGNAL_SOURCES)) {
      for (const source of sources) {
        expect(sourceUrlOf(source)).toMatch(/^https:\/\/(rt|data)\.(data\.gov\.hk|etabus\.gov\.hk)\//);
      }
    }
  });

  it("巴士信號一律選「以口岸為起點」的方向（I 或 O 皆可，但必須明確)", () => {
    const busSources = Object.values(PORT_SIGNAL_SOURCES).flat().filter((s) => s.bus);
    expect(busSources.length).toBeGreaterThan(0);
    for (const source of busSources) {
      expect(["I", "O"]).toContain(source.bus!.direction);
      expect(source.bus!.stop.length).toBeGreaterThan(0);
    }
  });
});

describe("班距計算", () => {
  it("同一班車的多筆 ETA 必須去重，否則會算出 0 分班距", () => {
    expect(headwayMinutes(["2026-10-13T08:00:00+08:00", "2026-10-13T08:00:00+08:00", "2026-10-13T08:10:00+08:00"])).toBe(10);
  });

  it("少於兩班時回傳 null（不能推論班距，也不能推論停駛）", () => {
    expect(headwayMinutes([])).toBeNull();
    expect(headwayMinutes(["2026-10-13T08:00:00+08:00"])).toBeNull();
    expect(headwayMinutes([null, undefined])).toBeNull();
  });

  it("取中位數，不被單一異常班距拉走", () => {
    expect(headwayMinutes(["2026-10-13T08:00:00+08:00", "2026-10-13T08:08:00+08:00", "2026-10-13T08:16:00+08:00", "2026-10-13T09:00:00+08:00"])).toBe(8);
  });
});

describe("排隊區間估算（純函式）", () => {
  it("口岸未開放時不給數字，直接判不可行", () => {
    const result = estimateBorderQueue({ portId: "lok-ma-chau", at: T2300 });
    expect(result.open).toBe(false);
    expect(result.queueMinutesRange).toBeNull();
    expect(result.signal).toBeNull();
  });

  it("未知口岸不編造，回傳 null 區間", () => {
    const result = estimateBorderQueue({ portId: "not-a-port", at: T0800 });
    expect(result.queueMinutesRange).toBeNull();
    expect(result.confidence).toBe("low");
  });

  it("高峰區間高於平峰，深夜最低", () => {
    const peak = estimateBorderQueue({ portId: "lo-wu", at: T0800 }).queueMinutesRange!;
    const offPeak = estimateBorderQueue({ portId: "lo-wu", at: "2026-10-13T13:00:00+08:00" }).queueMinutesRange!;
    // 06:00 羅湖尚未開放（06:30 才開），所以深夜要取 23:30——羅湖開放到 24:00。
    const late = estimateBorderQueue({ portId: "lo-wu", at: "2026-10-13T23:30:00+08:00" }).queueMinutesRange!;
    expect(peak[1]).toBeGreaterThan(offPeak[1]);
    expect(late[1]).toBeLessThan(peak[1]);
  });

  it("週末加成會把區間推高", () => {
    const weekday = estimateBorderQueue({ portId: "lo-wu", at: T0800 }).queueMinutesRange!;
    const saturday = estimateBorderQueue({ portId: "lo-wu", at: T0800_SAT }).queueMinutesRange!;
    expect(saturday[0]).toBeGreaterThanOrEqual(weekday[0]);
    expect(saturday[1]).toBeGreaterThan(weekday[1]);
  });

  it("惡劣天氣加成只在暴雨／颱風級別生效", () => {
    const clear = estimateBorderQueue({ portId: "lo-wu", at: T0800, weather: { condition: "clear", warning: null, updatedAt: T0800 } }).queueMinutesRange!;
    const rainy = estimateBorderQueue({ portId: "lo-wu", at: T0800, weather: { condition: "rain", warning: null, updatedAt: T0800 } }).queueMinutesRange!;
    const storm = estimateBorderQueue({ portId: "lo-wu", at: T0800, weather: { condition: "heavy_rain", warning: "黑色暴雨警告信號", updatedAt: T0800 } }).queueMinutesRange!;
    expect(rainy).toEqual(clear);
    expect(storm[1]).toBeGreaterThan(clear[1]);
  });

  it("鐵路中斷加成只給鐵路口岸，不套到純巴士口岸", () => {
    const rail = estimateBorderQueue({ portId: "lo-wu", at: T0800, railDisrupted: true }).queueMinutesRange!;
    const railBase = estimateBorderQueue({ portId: "lo-wu", at: T0800 }).queueMinutesRange!;
    const coach = estimateBorderQueue({ portId: "shenzhen-bay", at: T0800, railDisrupted: true }).queueMinutesRange!;
    const coachBase = estimateBorderQueue({ portId: "shenzhen-bay", at: T0800 }).queueMinutesRange!;
    expect(rail[1]).toBeGreaterThan(railBase[1]);
    expect(coach).toEqual(coachBase);
  });

  it("實測班距明顯大於常態時才加「運力變薄」", () => {
    const normal = estimateBorderQueue({ portId: "lo-wu", at: T0800, observations: [liveObservation({ observedHeadwayMinutes: 7 })] }).queueMinutesRange!;
    const thin = estimateBorderQueue({ portId: "lo-wu", at: T0800, observations: [liveObservation({ observedHeadwayMinutes: 14 })] }).queueMinutesRange!;
    expect(thin[1]).toBeGreaterThan(normal[1]);
    expect(normal).toEqual(estimateBorderQueue({ portId: "lo-wu", at: T0800 }).queueMinutesRange);
  });

  it("整體降為 cached 時仍然保留班距信號（不得因為層級變慢就丟掉觀測）", () => {
    const cachedObservation = liveObservation({ quality: "cached" });
    const result = estimateBorderQueue({ portId: "lo-wu", at: T0800, observations: [cachedObservation], quality: "cached" });
    expect(result.confidence).toBe("medium");
    expect(result.basis.join()).toContain("實測班距");
    expect(result.basis.join()).not.toContain("沒有運力信號");
  });

  it("置信度上限為 medium：有 live 觀測才到 medium，其餘一律 low", () => {
    const live = estimateBorderQueue({ portId: "lo-wu", at: T0800, observations: [liveObservation()], quality: "live" });
    const noSignal = estimateBorderQueue({ portId: "huanggang", at: T0800, quality: "live" });
    const offline = estimateBorderQueue({ portId: "lo-wu", at: T0800, observations: [liveObservation({ quality: "fixture", observedHeadwayMinutes: null })], quality: "fixture" });
    expect(live.confidence).toBe("medium");
    expect(noSignal.confidence).toBe("low");
    expect(offline.confidence).toBe("low");
  });

  it("任何估算都必須在文字裡寫明「估算」，不得冒充官方實時", () => {
    const result = estimateBorderQueue({ portId: "lo-wu", at: T0800, observations: [liveObservation()] });
    expect(result.note).toContain("估算");
    expect(result.note).toContain("非官方實時排隊資料");
  });

  it("同一輸入永遠得到同一輸出（決定性）", () => {
    const input = { portId: "shenzhen-bay" as const, at: T0800, observations: [liveObservation({ portId: "shenzhen-bay" })] };
    expect(estimateBorderQueue(input)).toEqual(estimateBorderQueue(input));
  });
});

describe("觀測抓取（注入 fetch，不連網）", () => {
  const mtrPayload = {
    data: {
      "EAL-LOW": {
          curr_time: "2026-10-13 08:00:00",
        DOWN: [
          { dest: "ADM", time: "2026-10-13 08:07:00", plat: "1" },
          { dest: "ADM", time: "2026-10-13 08:14:00", plat: "1" },
          { dest: "LOW", time: "2026-10-13 08:20:00", plat: "2" },
        ],
      },
    },
  };
  const ctbPayload = {
    generated_timestamp: T0800,
    data: [
      { co: "CTB", route: "B3X", dir: "I", stop: "003208", eta: "2026-10-13T08:10:00+08:00", rmk_tc: "" },
      { co: "CTB", route: "B3X", dir: "O", stop: "003208", eta: "2026-10-13T08:12:00+08:00", rmk_tc: "" },
      { co: "CTB", route: "B3X", dir: "I", stop: "003208", eta: "2026-10-13T08:25:00+08:00", rmk_tc: "" },
    ],
  };

  it("港鐵的延誤旗標會被保留下來（只有 Y 才算有延誤）", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ isdelay: "Y", ...mtrPayload }), { status: 200 }));
    const rows = await collectPortObservations({ fetcher: fetcher as unknown as typeof fetch, now: () => NOW, portIds: ["lo-wu"] });
    expect(rows[0]!.delayReported).toBe(true);
  });

  it("巴士來源沒有延誤旗標，如實為 null", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(ctbPayload), { status: 200 }));
    const rows = await collectPortObservations({ fetcher: fetcher as unknown as typeof fetch, now: () => NOW, portIds: ["shenzhen-bay"] });
    expect(rows[0]!.delayReported).toBeNull();
  });

  it("港鐵只取往指定終點方向的班次", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(mtrPayload), { status: 200 }));
    const rows = await collectPortObservations({ fetcher: fetcher as unknown as typeof fetch, now: () => NOW, portIds: ["lo-wu"] });
    const row = rows.find((r) => r.sourceId === "mtr-eal-low")!;
    expect(row.quality).toBe("live");
    expect(row.arrivals).toHaveLength(2); // 往 LOW 的那班必須被排除
    expect(row.observedHeadwayMinutes).toBe(7);
  });

  it("巴士只取指定方向，且忽略對向班次", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(ctbPayload), { status: 200 }));
    const rows = await collectPortObservations({ fetcher: fetcher as unknown as typeof fetch, now: () => NOW, portIds: ["shenzhen-bay"] });
    const row = rows.find((r) => r.sourceId === "ctb-b3x-szbay")!;
    expect(row.arrivals).toHaveLength(2);
    expect(row.observedHeadwayMinutes).toBe(15);
  });

  it("單一來源失敗不影響其他來源，且如實標為 fixture 並說明原因", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (String(url).includes("getSchedule")) throw new Error("boom");
      return new Response(JSON.stringify(ctbPayload), { status: 200 });
    });
    const rows = await collectPortObservations({ fetcher: fetcher as unknown as typeof fetch, now: () => NOW, portIds: ["lo-wu", "shenzhen-bay"] });
    const failed = rows.find((r) => r.portId === "lo-wu")!;
    const ok = rows.find((r) => r.portId === "shenzhen-bay")!;
    expect(failed.quality).toBe("fixture");
    expect(failed.note).toContain("沒有運力信號");
    expect(ok.quality).toBe("live");
  });

  it("逾時會被截斷，不會讓整個請求掛住", async () => {
    const fetcher = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    );
    const rows = await collectPortObservations({ fetcher: fetcher as unknown as typeof fetch, now: () => NOW, timeoutMs: 20, portIds: ["lo-wu"] });
    expect(rows[0]!.quality).toBe("fixture");
  });

  it("畸形回應不會拋出，只是沒有信號", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ nonsense: true }), { status: 200 }));
    const rows = await collectPortObservations({ fetcher: fetcher as unknown as typeof fetch, now: () => NOW, portIds: ["lo-wu"] });
    expect(rows[0]!.observedHeadwayMinutes).toBeNull();
  });

  it("HTTP 錯誤會被記錄成 fixture 觀測", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 503 }));
    const rows = await collectPortObservations({ fetcher: fetcher as unknown as typeof fetch, now: () => NOW, portIds: ["lo-wu"] });
    expect(rows[0]!.quality).toBe("fixture");
    expect(rows[0]!.note).toContain("503");
  });
});

describe("PortConditionClient 三退路", () => {
  it("live → cached：第二次在讀取快取內不再打網路，並標為 cached", async () => {
    let clock = NOW;
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: { "EAL-LOW": { curr_time: "2026-10-13 08:00:00", DOWN: [{ dest: "ADM", time: "2026-10-13 08:07:00", plat: "1" }, { dest: "ADM", time: "2026-10-13 08:14:00", plat: "1" }] } } }), { status: 200 });
    });
    const client = new PortConditionClient({ fetcher: fetcher as unknown as typeof fetch, now: () => clock });
    const first = await client.resolve({ at: T0800, portIds: ["lo-wu"] });
    expect(first.quality).toBe("live");
    const callsAfterFirst = calls;
    clock += 5_000;
    const second = await client.resolve({ at: T0800, portIds: ["lo-wu"] });
    expect(calls).toBe(callsAfterFirst);
    expect(second.quality).toBe("cached");
    expect(second.notices.join()).toBe("");
  });

  it("live → cached：來源失敗但在效期內，使用快取而不是降回先驗", async () => {
    let clock = NOW;
    let fail = false;
    const fetcher = vi.fn(async () => {
      if (fail) throw new Error("network down");
      return new Response(JSON.stringify({ data: { "EAL-LOW": { curr_time: "2026-10-13 08:00:00", DOWN: [{ dest: "ADM", time: "2026-10-13 08:07:00", plat: "1" }, { dest: "ADM", time: "2026-10-13 08:20:00", plat: "1" }] } } }), { status: 200 });
    });
    const client = new PortConditionClient({ fetcher: fetcher as unknown as typeof fetch, now: () => clock });
    await client.resolve({ at: T0800, portIds: ["lo-wu"] });
    clock += 60_000; // 過了讀取快取、仍在來源效期內
    fail = true;
    const fallback = await client.resolve({ at: T0800, portIds: ["lo-wu"] });
    expect(fallback.quality).toBe("cached");
    expect(fallback.notices.join()).toContain("快取");
  });

  it("live → cached → fixture：全都失敗時降為先驗，並在 notice 說明", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("offline");
    });
    const client = new PortConditionClient({ fetcher: fetcher as unknown as typeof fetch, now: () => NOW });
    const result = await client.resolve({ at: T0800, portIds: ["lo-wu"] });
    expect(result.quality).toBe("fixture");
    expect(result.byPort["lo-wu"]!.confidence).toBe("low");
    expect(result.notices.join()).toContain("失敗");
  });

  it("沒有公開來源的口岸會標成先驗估算並留下 notice，不用別的班次填充", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("offline");
    });
    const client = new PortConditionClient({ fetcher: fetcher as unknown as typeof fetch, now: () => NOW });
    const result = await client.resolve({ at: T0800, portIds: ["huanggang"] });
    expect(result.quality).toBe("fixture");
    expect(result.notices.join()).toContain("皇巴");
    expect(result.sources[0]!.url).toBeNull();
    expect(result.sources[0]!.note).toContain("先驗估算");
  });

  it("可以只估算被查詢的口岸，且逐口岸標註品質", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (String(url).includes("getSchedule")) return new Response(JSON.stringify({ data: { "EAL-LOW": { curr_time: "2026-10-13 08:00:00", DOWN: [] } } }), { status: 200 });
      throw new Error("bus offline");
    });
    const client = new PortConditionClient({ fetcher: fetcher as unknown as typeof fetch, now: () => NOW });
    const result = await client.resolve({ at: T0800, portIds: ["lo-wu", "shenzhen-bay"] });
    expect(Object.keys(result.byPort).sort()).toEqual(["lo-wu", "shenzhen-bay"]);
    expect(result.byPort["lo-wu"]).toBeDefined();
    expect(result.sources.some((s) => s.label.includes("深圳灣"))).toBe(true);
  });

  it("回傳的來源標註帶官方 URL 與更新時間，可供 UI 溯源", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: { "EAL-LOW": { curr_time: "2026-10-13 08:00:00", DOWN: [] } } }), { status: 200 }));
    const client = new PortConditionClient({ fetcher: fetcher as unknown as typeof fetch, now: () => NOW });
    const result = await client.resolve({ at: T0800, portIds: ["lo-wu"] });
    const source = result.sources.find((s) => s.id.includes("mtr-eal-low"))!;
    expect(source.url).toContain("rt.data.gov.hk");
    expect(source.updatedAt).toBeTruthy();
  });
});
