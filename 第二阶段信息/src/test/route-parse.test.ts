/**
 * 路徑解析器測試。
 *
 * 解析器是「路徑讀取」的心臟，這一組測試固定它的四項職責：
 * 交通方式對照、跨境判定、時間推進、幾何誠實補齊。
 */
import { describe, expect, it } from "vitest";
import { RouteParseError, mapMode, parseRawJourney } from "@/lib/route/parse";
import type { RawJourney, RawStep } from "@/lib/types/route";

const DEPART = "2026-10-13T08:00:00+08:00";

function step(overrides: Partial<RawStep> & Pick<RawStep, "mode" | "from" | "to">): RawStep {
  return {
    line: null,
    durationMinutes: 10,
    geometry: [],
    ...overrides,
  };
}

function journey(steps: RawStep[], extra: Partial<RawJourney> = {}): RawJourney {
  return { id: "test", label: "測試路線", departAt: DEPART, steps, ...extra };
}

describe("交通方式對照", () => {
  it("常見供應商字串都能對照", () => {
    expect(mapMode("walking").mode).toBe("walk");
    expect(mapMode("MTR").mode).toBe("mtr");
    expect(mapMode("bus").mode).toBe("bus");
    expect(mapMode("ferry").mode).toBe("ferry");
    expect(mapMode("cross_border_bus").mode).toBe("cross_border_bus");
    expect(mapMode("hsr").mode).toBe("hsr");
  });

  it("道路路網對照為巴士（本專案沒有私家車模式）", () => {
    expect(mapMode("driving").mode).toBe("bus");
  });

  it("未識別的方式按巴士處理並回報", () => {
    const mapping = mapMode("magic_carpet");
    expect(mapping.mode).toBe("bus");
    expect(mapping.notice).toContain("magic_carpet");
  });
});

describe("跨境判定", () => {
  it("香港境內路段標為 in_hk", () => {
    const { journey: parsed } = parseRawJourney(
      journey([
        step({
          mode: "mtr",
          from: { name: "中環站", lat: 22.282, lon: 114.158 },
          to: { name: "金鐘站", lat: 22.279, lon: 114.165 },
        }),
      ]),
    );
    expect(parsed.segments[0]?.kind).toBe("in_hk");
    expect(parsed.crossesBorder).toBe(false);
    expect(parsed.borderPortIds).toEqual([]);
  });

  it("香港側到深圳側標為 border_crossing 並綁定口岸", () => {
    const { journey: parsed } = parseRawJourney(
      journey(
        [
          step({
            mode: "walk",
            from: { name: "落馬洲站", lat: 22.5145, lon: 114.0656 },
            to: { name: "福田口岸", lat: 22.519, lon: 114.068 },
            durationMinutes: 12,
            geometry: [
              [114.0656, 22.5145],
              [114.068, 22.519],
            ],
          }),
        ],
        {
          borderQueues: {
            "lok-ma-chau": {
              portId: "lok-ma-chau",
              queueMinutesRange: [12, 28],
              confidence: "low",
              note: "測試用估算。",
            },
          },
        },
      ),
    );

    const segment = parsed.segments[0];
    expect(segment?.kind).toBe("border_crossing");
    expect(segment?.border?.portId).toBe("lok-ma-chau");
    expect(parsed.crossesBorder).toBe(true);
    expect(parsed.borderPortIds).toEqual(["lok-ma-chau"]);
  });

  it("深圳境內路段標為 in_sz", () => {
    const { journey: parsed } = parseRawJourney(
      journey([
        step({
          mode: "mtr",
          from: { name: "福田口岸", lat: 22.519, lon: 114.068 },
          to: { name: "福田", lat: 22.539, lon: 114.057 },
        }),
      ]),
    );
    expect(parsed.segments[0]?.kind).toBe("in_sz");
  });

  it("缺少排隊資料時給出誠實提示，不編造數值", () => {
    const { journey: parsed, notices } = parseRawJourney(
      journey([
        step({
          mode: "walk",
          from: { name: "落馬洲站", lat: 22.5145, lon: 114.0656 },
          to: { name: "福田口岸", lat: 22.519, lon: 114.068 },
        }),
      ]),
    );
    expect(parsed.segments[0]?.border).toBeUndefined();
    expect(notices.some((notice) => notice.includes("沒有"))).toBe(true);
  });

  it("跨境行程記錄經過的所有口岸（依行進順序）", () => {
    const { journey: parsed } = parseRawJourney(
      journey([
        step({
          mode: "walk",
          from: { name: "落馬洲站", lat: 22.5145, lon: 114.0656 },
          to: { name: "福田口岸", lat: 22.519, lon: 114.068 },
        }),
        step({
          mode: "cross_border_bus",
          from: { name: "深圳灣口岸（香港側）", lat: 22.502, lon: 113.944 },
          to: { name: "深圳灣口岸（深圳側）", lat: 22.505, lon: 113.95 },
        }),
      ]),
    );
    expect(parsed.borderPortIds).toEqual(["lok-ma-chau", "shenzhen-bay"]);
  });
});

describe("時間推進", () => {
  it("由出發時間逐段累加，總時間等於各段之和", () => {
    const { journey: parsed } = parseRawJourney(
      journey([
        step({
          mode: "walk",
          from: { name: "中環（交易廣場）", lat: 22.284, lon: 114.159 },
          to: { name: "中環站", lat: 22.282, lon: 114.158 },
          durationMinutes: 5,
        }),
        step({
          mode: "mtr",
          from: { name: "中環站", lat: 22.282, lon: 114.158 },
          to: { name: "金鐘站", lat: 22.279, lon: 114.165 },
          durationMinutes: 3,
        }),
      ]),
    );

    expect(parsed.segments[0]?.departAt).toBe(DEPART);
    expect(parsed.segments[0]?.arriveAt).toBe("2026-10-13T08:05:00+08:00");
    expect(parsed.segments[1]?.departAt).toBe("2026-10-13T08:05:00+08:00");
    expect(parsed.segments[1]?.arriveAt).toBe("2026-10-13T08:08:00+08:00");
    expect(parsed.totalMinutes).toBe(8);
    expect(parsed.arriveAt).toBe("2026-10-13T08:08:00+08:00");
  });

  it("負數或非整數時間被收斂成合法值", () => {
    const { journey: parsed } = parseRawJourney(
      journey([
        step({
          mode: "walk",
          from: { name: "中環站", lat: 22.282, lon: 114.158 },
          to: { name: "金鐘站", lat: 22.279, lon: 114.165 },
          durationMinutes: -5,
        }),
      ]),
    );
    expect(parsed.segments[0]?.durationMinutes).toBe(0);
  });
});

describe("幾何與錯誤處理", () => {
  it("缺少座標時用起終點連線代替並提示", () => {
    const { journey: parsed, notices } = parseRawJourney(
      journey([
        step({
          mode: "walk",
          from: { name: "中環站", lat: 22.282, lon: 114.158 },
          to: { name: "金鐘站", lat: 22.279, lon: 114.165 },
        }),
      ]),
    );
    expect(parsed.segments[0]?.geometry).toEqual([
      [114.158, 22.282],
      [114.165, 22.279],
    ]);
    expect(notices.some((notice) => notice.includes("直線"))).toBe(true);
  });

  it("供應商提供的折線會原樣保留", () => {
    const geometry: [number, number][] = [
      [114.158, 22.282],
      [114.16, 22.28],
      [114.165, 22.279],
    ];
    const { journey: parsed } = parseRawJourney(
      journey([
        step({
          mode: "walk",
          from: { name: "中環站", lat: 22.282, lon: 114.158 },
          to: { name: "金鐘站", lat: 22.279, lon: 114.165 },
          geometry,
        }),
      ]),
    );
    expect(parsed.segments[0]?.geometry).toEqual(geometry);
  });

  it("空路線會被拒絕", () => {
    expect(() => parseRawJourney(journey([]))).toThrowError(RouteParseError);
    try {
      parseRawJourney(journey([]));
    } catch (error) {
      expect((error as RouteParseError).code).toBe("EMPTY_JOURNEY");
    }
  });

  it("無法解析的出發時間會被拒絕", () => {
    try {
      parseRawJourney({ ...journey([]), departAt: "not-a-date", steps: [] });
    } catch (error) {
      expect((error as RouteParseError).code).toBe("INVALID_DEPART_AT");
    }
  });

  it("解析是決定性的：同一輸入得到同一輸出", () => {
    const raw = journey([
      step({
        mode: "mtr",
        from: { name: "落馬洲站", lat: 22.5145, lon: 114.0656 },
        to: { name: "福田口岸", lat: 22.519, lon: 114.068 },
        durationMinutes: 12,
      }),
    ]);
    expect(parseRawJourney(raw)).toEqual(parseRawJourney(raw));
  });
});
