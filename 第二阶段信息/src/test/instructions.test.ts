/**
 * 分步指示生成測試（遷移自 CampusMapApp，原專案無測試）。
 */
import { describe, expect, it } from "vitest";
import {
  compassIndex,
  compassLabel,
  describeJourney,
  describeManeuver,
  describeModes,
  describeSegment,
  turnWord,
} from "@/lib/route/instructions";
import { resolveRoutes } from "@/lib/route/adapter";
import { borderSegments, type Journey } from "@/lib/types/journey";

async function crossBorderJourney(): Promise<Journey> {
  const { resolution } = await resolveRoutes({
    query: {
      origin: "central-exchange-square",
      destination: "futian-station-sz",
      departAt: "2026-10-13T08:00",
    },
  });
  const candidate = resolution.candidates[0];
  if (!candidate) throw new Error("測試需要至少一條跨境候選路線。");
  return candidate.journey;
}

describe("方位角", () => {
  it("八方位對照正確", () => {
    expect(compassIndex(0)).toBe(0);
    expect(compassIndex(45)).toBe(1);
    expect(compassIndex(90)).toBe(2);
    expect(compassIndex(180)).toBe(4);
    expect(compassIndex(270)).toBe(6);
    expect(compassIndex(315)).toBe(7);
  });

  it("負角度與超過 360 度都會正規化", () => {
    expect(compassIndex(-10)).toBe(0);
    expect(compassIndex(350)).toBe(0);
    expect(compassIndex(450)).toBe(2);
  });

  it("方位標籤支援中英文", () => {
    expect(compassLabel(90)).toBe("東");
    expect(compassLabel(90, "en")).toBe("east");
    expect(compassLabel(225)).toBe("西南");
  });
});

describe("轉向詞", () => {
  it("常見轉向詞都能翻譯", () => {
    expect(turnWord("left")).toBe("左轉");
    expect(turnWord("right")).toBe("右轉");
    expect(turnWord("slight left")).toBe("稍向左");
    expect(turnWord("sharp right")).toBe("向右急轉");
    expect(turnWord("uturn")).toBe("掉頭");
  });

  it("未提供或未識別的轉向退回直行", () => {
    expect(turnWord(undefined)).toBe("直行");
    expect(turnWord("teleport")).toBe("繼續前行");
  });

  it("英文模式", () => {
    expect(turnWord("left", "en")).toBe("turn left");
    expect(turnWord(undefined, "en")).toBe("continue straight");
  });
});

describe("轉向指示（供應商提供 maneuver 時）", () => {
  it("出發：帶方位與路名", () => {
    const text = describeManeuver(
      { type: "depart", bearingAfter: 90 },
      { streetName: "皇后大道中" },
    );
    expect(text).toContain("開始步行");
    expect(text).toContain("向東");
    expect(text).toContain("皇后大道中");
  });

  it("抵達：帶目的地左右側", () => {
    expect(describeManeuver({ type: "arrive", modifier: "left" })).toContain("左側");
    expect(describeManeuver({ type: "arrive", modifier: "right" })).toContain("右側");
    expect(describeManeuver({ type: "arrive" })).toBe("抵達目的地");
  });

  it("轉向：帶街道名", () => {
    expect(describeManeuver({ type: "turn", modifier: "left" }, { streetName: "德輔道中" })).toBe(
      "左轉，進入 德輔道中",
    );
    expect(describeManeuver({ type: "turn", modifier: "left" })).toBe("左轉");
  });

  it("英文模式", () => {
    expect(describeManeuver({ type: "arrive", modifier: "left" }, { lang: "en" })).toContain(
      "on your left",
    );
  });
});

describe("路段指示（用我們自己的 Journey）", () => {
  it("步行段說出目的地與時間", async () => {
    const journey = await crossBorderJourney();
    const walk = journey.segments[0];
    if (!walk) throw new Error("缺少路段");
    expect(describeSegment(walk)).toContain("步行前往");
    expect(describeSegment(walk)).toContain("分鐘");
  });

  it("軌道段說出線路名稱", async () => {
    const journey = await crossBorderJourney();
    const rail = journey.segments.find((segment) => segment.line === "東鐵線");
    if (!rail) throw new Error("缺少東鐵線路段");
    expect(describeSegment(rail)).toBe(`乘 東鐵線 至 ${rail.to.name}（${rail.durationMinutes} 分鐘）`);
  });

  it("通關段必須帶口岸、排隊區間、「估算」與置信度", async () => {
    const journey = await crossBorderJourney();
    const crossing = borderSegments(journey)[0];
    if (!crossing) throw new Error("缺少通關段");
    const text = describeSegment(crossing);
    expect(text).toContain("落馬洲支線口岸");
    expect(text).toContain("–");
    expect(text).toContain("估算");
    expect(text).toContain("置信度");
  });

  it("缺少排隊資料時不編造數值", () => {
    const text = describeSegment({
      id: "x",
      mode: "walk",
      kind: "border_crossing",
      line: null,
      from: {
        id: "a",
        name: "落馬洲站",
        lat: 22.5145,
        lon: 114.0656,
        kind: "station",
        side: "hk",
        sideSource: "registry",
      },
      to: {
        id: "b",
        name: "福田口岸",
        lat: 22.519,
        lon: 114.068,
        kind: "port",
        side: "sz",
        sideSource: "registry",
      },
      departAt: "2026-10-13T08:00:00+08:00",
      arriveAt: "2026-10-13T08:12:00+08:00",
      durationMinutes: 12,
      geometry: [],
      viaStations: [],
      viaDistricts: [],
    });
    expect(text).toContain("暫無資料");
    expect(text).not.toMatch(/\d+–\d+/);
  });
});

describe("整條路線的分步指示", () => {
  it("逐步編號由 1 起算，且涵蓋全部路段", async () => {
    const journey = await crossBorderJourney();
    const steps = describeJourney(journey);
    expect(steps).toHaveLength(journey.segments.length);
    expect(steps.map((step) => step.index)).toEqual(
      journey.segments.map((_, index) => index + 1),
    );
  });

  it("同方式不同線路會標記為轉乘", async () => {
    const journey = await crossBorderJourney();
    const steps = describeJourney(journey);
    const transfer = steps.find((step) => step.isTransfer);
    expect(transfer).toBeDefined();
    expect(transfer?.text).toContain("東鐵線");
  });

  it("步行接軌道不算轉乘", async () => {
    const journey = await crossBorderJourney();
    const steps = describeJourney(journey);
    expect(steps[1]?.isTransfer).toBe(false);
  });

  it("通關段不會被標記為轉乘", async () => {
    const journey = await crossBorderJourney();
    const steps = describeJourney(journey);
    expect(steps.filter((step) => step.kind === "border_crossing").every((step) => !step.isTransfer)).toBe(
      true,
    );
  });

  it("可在時間軸上直接顯示起訖時間", async () => {
    const journey = await crossBorderJourney();
    for (const step of describeJourney(journey)) {
      expect(Number.isNaN(Date.parse(step.departAt))).toBe(false);
      expect(Number.isNaN(Date.parse(step.arriveAt))).toBe(false);
    }
  });
});

describe("一行摘要", () => {
  it("跨境行程會顯示跨境通關", async () => {
    expect(describeModes(await crossBorderJourney())).toContain("跨境通關");
  });

  it("香港境內行程不含跨境字樣", async () => {
    const { resolution } = await resolveRoutes({
      query: {
        origin: "hang-hau-estate",
        destination: "central-exchange-square",
        departAt: "2026-10-13T08:00",
      },
    });
    const candidate = resolution.candidates[0];
    if (!candidate) throw new Error("缺少候選路線");
    expect(describeModes(candidate.journey)).not.toContain("跨境");
  });
});
