/**
 * 手動探針：五因子風險 + 可靠性 + 四模式排序（成員 A 的 W7 驗收工具）。
 *
 * 用途：把「候選路線 → 風險 → 可靠性 → 排序」的實際結果印出來，方便人工核對與示範。
 * 完全離線、無需金鑰、結果可重現。
 *
 *   npm run probe:risk
 *
 * 分三節：
 *   1. 真實跨境走廊的四模式排序（誠實結果：當一條路線同時最快又最穩，四個模式會一致推薦它）
 *   2. 合成對照組（規則驗證用）——「快但風險高」對「慢但風險低」，證明模式真的會改變推薦
 *   3. 境內行程不計通關風險
 */
import { expect, it } from "vitest";
import { resolveRoutes } from "@/lib/route/adapter";
import { parseRawJourney } from "@/lib/route/parse";
import { ROUTE_MODES, modeProfileOf } from "@/lib/risk/thresholds";
import { rankCandidates } from "@/lib/reliability";
import { findPlace } from "@/lib/geo/places";
import { formatHkTime, hkIsoFromMinutes } from "@/lib/time";
import type { RawJourney, RawStep } from "@/lib/types/route";
import type { RiskContext, RiskRouteSource } from "@/lib/types/risk";
import type { RouteRanking } from "@/lib/types/reliability";

const DEPART = "2026-10-13T08:00";
const SERVICE_DATE = "2026-10-13";

/**
 * 演示用的資料情境。
 *
 * 刻意如實標示 `quality: "fixture"`：這是固定演示樣本，不是即時資料。
 * 風險引擎會據此壓低可信度——這正是「不把演示資料偽裝成即時資料」的體現。
 */
function demoContext(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    quality: "fixture",
    weather: { condition: "cloudy", warning: null, updatedAt: "2026-10-13T07:30:00+08:00" },
    service: {
      status: "ok",
      delayMinutes: 0,
      crowding: "medium",
      updatedAt: "2026-10-13T07:30:00+08:00",
    },
    incidents: [],
    crowd: null,
    border: null,
    ...overrides,
  };
}

function printRanking(title: string, ranking: RouteRanking): void {
  const profile = modeProfileOf(ranking.mode);
  console.log(`\n▸ ${title}｜模式「${profile.label}」（時間權重 ${profile.timeWeight}／風險權重 ${profile.riskWeight}）`);
  for (const ranked of ranking.ranked) {
    const mark = ranked.routeId === ranking.recommendedRouteId ? "★" : " ";
    console.log(
      `${mark} ${ranked.label}｜推薦分 ${ranked.rankScore}（時間分 ${ranked.timeScore}／風險 ${ranked.riskScore} ${ranked.risk.level}）｜準時信心 ${ranked.reliability.onTimeConfidence}｜ETA ${formatHkTime(ranked.reliability.etaRange[0])}–${formatHkTime(ranked.reliability.etaRange[1])}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 1. 真實跨境走廊
// ─────────────────────────────────────────────────────────────

it("真實跨境走廊：四模式排序（中環 → 深圳福田）", async () => {
  const { resolution } = await resolveRoutes({
    query: { origin: "central-exchange-square", destination: "futian-station-sz", departAt: DEPART },
  });
  const context = demoContext();

  console.log(`\n=== 風險明細（${resolution.quality} 資料）===`);
  const balanced = rankCandidates(resolution.candidates, context, { mode: "balanced" });
  for (const ranked of balanced.ranked) {
    const factors = ranked.risk.breakdown.factors
      .map((f) => `${f.id} ${f.score}×${f.weight.toFixed(2)}=${f.contribution.toFixed(1)}`)
      .join("｜");
    console.log(`• ${ranked.label}｜風險 ${ranked.riskScore}（${ranked.risk.level}）｜可信度 ${ranked.risk.breakdown.confidence}`);
    console.log(`   因子：${factors}`);
  }

  console.log("\n=== 四種模式 ===");
  for (const mode of ROUTE_MODES) {
    printRanking("中環 → 福田", rankCandidates(resolution.candidates, context, { mode }));
  }

  expect(resolution.candidates.every((candidate) => candidate.journey.crossesBorder)).toBe(true);
  for (const mode of ROUTE_MODES) {
    const ranking = rankCandidates(resolution.candidates, context, { mode });
    expect(ranking.ranked.length).toBe(resolution.candidates.length);
    expect(ranking.recommendedRouteId).not.toBeNull();
    // 跨境候選必須含 border 因子，且權重不為 0。
    for (const ranked of ranking.ranked) {
      const border = ranked.risk.breakdown.factors.find((factor) => factor.id === "border");
      expect(border?.weight ?? 0).toBeGreaterThan(0);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 2. 合成對照組：證明模式真的會改變推薦
// ─────────────────────────────────────────────────────────────

function point(id: string): { name: string; lat: number; lon: number } {
  const place = findPlace(id);
  if (!place) throw new Error(`合成路線引用了未註冊的地點：${id}`);
  return { name: place.name, lat: place.lat, lon: place.lon };
}

function step(mode: string, lineName: string | null, fromId: string, toId: string, minutes: number, viaStations: string[] = []): RawStep {
  const from = point(fromId);
  const to = point(toId);
  return {
    mode,
    line: lineName,
    from,
    to,
    durationMinutes: minutes,
    geometry: [
      [from.lon, from.lat],
      [to.lon, to.lat],
    ],
    viaStations,
  };
}

/** 快線：經落馬洲，但該口岸排隊很長。 */
function fastButRisky(): RawJourney {
  return {
    id: "syn-fast",
    label: "快線（經落馬洲，排隊長）",
    departAt: hkIsoFromMinutes(SERVICE_DATE, 8 * 60),
    borderQueues: {
      "lok-ma-chau": {
        portId: "lok-ma-chau",
        queueMinutesRange: [50, 80],
        confidence: "low",
        note: "估算：演示用極端排隊情境。",
      },
    },
    steps: [
      step("walk", null, "central-exchange-square", "central-station", 5),
      step("mtr", "東鐵線", "central-station", "lok-ma-chau-station", 55, ["上水"]),
      step("walk", null, "lok-ma-chau-station", "futian-checkpoint", 15),
    ],
  };
}

/** 慢線：經深圳灣，口岸順暢、無事故。 */
function slowButSafe(): RawJourney {
  return {
    id: "syn-safe",
    label: "慢線（經深圳灣，順暢）",
    departAt: hkIsoFromMinutes(SERVICE_DATE, 8 * 60),
    borderQueues: {
      "shenzhen-bay": {
        portId: "shenzhen-bay",
        queueMinutesRange: [5, 10],
        confidence: "low",
        note: "估算：演示用順暢情境。",
      },
    },
    steps: [
      step("walk", null, "central-exchange-square", "central-station", 5),
      step("cross_border_bus", "跨境巴士（深圳灣線）", "central-station", "shenzhen-bay-checkpoint-hk", 60),
      step("walk", null, "shenzhen-bay-checkpoint-hk", "shenzhen-bay-checkpoint", 20),
    ],
  };
}

/** 又慢又險的第三選項：經皇崗，路程長且口岸中等排隊。 */
function slowAndRisky(): RawJourney {
  return {
    id: "syn-slow",
    label: "慢線（經皇崗，路程長）",
    departAt: hkIsoFromMinutes(SERVICE_DATE, 8 * 60),
    borderQueues: {
      huanggang: {
        portId: "huanggang",
        queueMinutesRange: [20, 30],
        confidence: "low",
        note: "估算：演示用中等排隊情境。",
      },
    },
    steps: [
      step("walk", null, "central-exchange-square", "central-station", 5),
      step("cross_border_bus", "跨境巴士（皇崗線）", "central-station", "huanggang-hk", 90),
      step("walk", null, "huanggang-hk", "huanggang-checkpoint", 15),
    ],
  };
}

it("合成對照組：最快模式與最穩模式給出不同推薦", () => {
  const routes: RiskRouteSource[] = [
    { id: "syn-fast", label: "快線（經落馬洲，排隊長）", quality: "fixture", journey: parseRawJourney(fastButRisky()).journey },
    { id: "syn-safe", label: "慢線（經深圳灣，順暢）", quality: "fixture", journey: parseRawJourney(slowButSafe()).journey },
    { id: "syn-slow", label: "慢線（經皇崗，路程長）", quality: "fixture", journey: parseRawJourney(slowAndRisky()).journey },
  ];

  // 注入 4 條只影響東鐵線沿線（上水）的事故，讓快線的服務中斷風險顯著升高。
  const context = demoContext({
    incidents: [0, 1, 2, 3].map((index) => ({
      id: `inc-${index}`,
      title: `東鐵線事故 ${index + 1}`,
      detail: "演示用注入事件。",
      affects: ["上水"],
    })),
  });

  console.log("\n=== 合成對照組（規則驗證用，非真實走廊）===");
  const recommendations: Record<string, string | null> = {};
  for (const mode of ROUTE_MODES) {
    const ranking = rankCandidates(routes, context, { mode });
    recommendations[mode] = ranking.recommendedRouteId;
    printRanking("合成對照組", ranking);
  }

  // 核心斷言：模式不同 → 推薦不同（證明四模式只調權重也足以改變結論）。
  // 「最快」追時間，選快但風險高的落馬洲線；「最穩」追低風險，改選順暢的深圳灣線。
  expect(recommendations.fastest).toBe("syn-fast");
  expect(recommendations.reliable).toBe("syn-safe");
  expect(new Set(Object.values(recommendations)).size).toBeGreaterThanOrEqual(2);
});

// ─────────────────────────────────────────────────────────────
// 3. 境內行程不計通關風險
// ─────────────────────────────────────────────────────────────

it("境內行程：border 因子為 0 且權重為 0", async () => {
  const { resolution } = await resolveRoutes({
    query: { origin: "hang-hau-estate", destination: "central-exchange-square", departAt: DEPART },
  });
  const context = demoContext();
  const ranking = rankCandidates(resolution.candidates, context, { mode: "balanced" });

  for (const ranked of ranking.ranked) {
    const border = ranked.risk.breakdown.factors.find((factor) => factor.id === "border");
    console.log(
      `• ${ranked.label}｜風險 ${ranked.riskScore}（${ranked.risk.level}）｜通關因子 ${border?.score}（權重 ${border?.weight}）`,
    );
    expect(border?.score).toBe(0);
    expect(border?.weight).toBe(0);
  }
  expect(resolution.candidates[0]?.journey.crossesBorder).toBe(false);
});
