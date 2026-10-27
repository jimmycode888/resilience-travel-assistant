/**
 * 可靠性評估與四模式排序測試。
 *
 * 這組測試固定三件事：
 *   1. 對外輸出**永遠不含百分比**（產品倫理硬約束）；
 *   2. 資料品質會壓低信心（fixture 不得宣稱高信心）；
 *   3. 四種模式確實會給出不同的排序，且排序是決定性的。
 */
import { describe, expect, it } from "vitest";
import { assessReliability, rankRoutes } from "@/lib/reliability";
import { riskLevelOf } from "@/lib/risk/thresholds";
import type { Journey, JourneyMode, JourneySegment, PlaceRef } from "@/lib/types/journey";
import type { RankableRoute, ReliabilityResult } from "@/lib/types/reliability";
import type {
  RiskFactor,
  RiskFactorId,
  RiskWeights,
  RouteMode,
  RouteRisk,
} from "@/lib/types/risk";
import type { RouteQuality } from "@/lib/types/route";

const DEPART = "2026-10-13T08:00:00+08:00";
const ARRIVE = "2026-10-13T08:30:00+08:00";

// ─────────────────────────────────────────────────────────────
// 測試資料工廠（純資料，無副作用）
// ─────────────────────────────────────────────────────────────

function place(name: string, side: "hk" | "sz"): PlaceRef {
  return { id: name, name, lat: 22.3, lon: 114.17, kind: "station", side, sideSource: "registry" };
}

function segment(mode: JourneyMode, index: number): JourneySegment {
  return {
    id: `seg-${index}`,
    mode,
    kind: "in_hk",
    line: mode === "walk" ? null : "測試線",
    from: place(`起${index}`, "hk"),
    to: place(`終${index}`, "hk"),
    departAt: DEPART,
    arriveAt: ARRIVE,
    durationMinutes: 10,
    geometry: [
      [114.17, 22.3],
      [114.18, 22.31],
    ],
    viaStations: [],
    viaDistricts: [],
  };
}

function journey(
  id: string,
  label: string,
  totalMinutes: number,
  modes: JourneyMode[],
): Journey {
  return {
    id,
    label,
    segments: modes.map((mode, index) => segment(mode, index)),
    departAt: DEPART,
    arriveAt: ARRIVE,
    totalMinutes,
    crossesBorder: false,
    borderPortIds: [],
  };
}

function riskFactor(id: RiskFactorId, score: number, weight: number): RiskFactor {
  return {
    id,
    score,
    level: riskLevelOf(score),
    weight,
    contribution: Number((score * weight).toFixed(2)),
    claim: `${id} 因子風險`,
    evidence: `${id} 原始分數 ${score}`,
    source: "RISK_ENGINE.md §3",
    sourceUrl: null,
  };
}

function makeRisk(input: {
  routeId: string;
  label: string;
  score: number;
  quality: RouteQuality;
  crossesBorder?: boolean;
  crowdScore?: number;
  borderScore?: number;
}): RouteRisk {
  const crossesBorder = input.crossesBorder ?? false;
  const scores: Record<RiskFactorId, number> = {
    weather: 20,
    crowd: input.crowdScore ?? 30,
    disruption: 25,
    transfer: 15,
    border: input.borderScore ?? 0,
  };
  const weights: RiskWeights = crossesBorder
    ? { weather: 0.15, crowd: 0.2, disruption: 0.25, transfer: 0.1, border: 0.3 }
    : { weather: 0.25, crowd: 0.25, disruption: 0.35, transfer: 0.15, border: 0 };
  const factors: RiskFactor[] = (Object.keys(scores) as RiskFactorId[]).map((id) =>
    riskFactor(id, scores[id], weights[id]),
  );

  return {
    routeId: input.routeId,
    label: input.label,
    mode: "balanced",
    crossesBorder,
    score: input.score,
    level: riskLevelOf(input.score),
    breakdown: {
      weather: scores.weather,
      crowd: scores.crowd,
      disruption: scores.disruption,
      transfer: scores.transfer,
      border: scores.border,
      overall: input.score,
      weights,
      factors,
      confidence: input.quality === "live" ? "high" : "medium",
    },
    quality: input.quality,
    notices: [],
  };
}

/** 一條境內、單段地鐵的候選（兩次轉乘由 modes 長度控制）。 */
function route(
  id: string,
  label: string,
  totalMinutes: number,
  quality: RouteQuality,
  modes: JourneyMode[] = ["mtr"],
): RankableRoute {
  return { route: { id, label, quality, journey: journey(id, label, totalMinutes, modes) }, risk: makeRisk({ routeId: id, label, score: 30, quality }) };
}

// ─────────────────────────────────────────────────────────────
// 測試
// ─────────────────────────────────────────────────────────────

describe("assessReliability", () => {
  it("ETA 區間從實際到達時間起算，且最遲晚於最早", () => {
    const entry = route("r1", "測試路線", 30, "live");
    const result = assessReliability(entry.route, entry.risk);

    expect(result.etaRange[0]).toBe(entry.route.journey.arriveAt);
    expect(result.etaRange[0] < result.etaRange[1]).toBe(true);
  });

  it("信心為定性分級、備註非空，且輸出不含百分比", () => {
    const entry = route("r2", "測試路線", 30, "live");
    const result: ReliabilityResult = assessReliability(entry.route, entry.risk);

    expect(["high", "medium", "low"]).toContain(result.onTimeConfidence);
    expect(result.confidenceNote.length).toBeGreaterThan(0);
    expect(JSON.stringify(result).includes("%")).toBe(false);
  });

  it("fixture 品質不得宣稱高信心", () => {
    const entry = route("r3", "演示路線", 30, "fixture");
    const result = assessReliability(entry.route, entry.risk);

    expect(result.onTimeConfidence).not.toBe("high");
    expect(result.notices.join(" ")).toContain("fixture");
  });

  it("跨境候選的風險含 border 因子，並反映在結果上", () => {
    const entry: RankableRoute = {
      route: {
        id: "xb",
        label: "跨境路線",
        quality: "live",
        journey: journey("xb", "跨境路線", 60, ["mtr", "cross_border_bus"]),
      },
      risk: makeRisk({
        routeId: "xb",
        label: "跨境路線",
        score: 55,
        quality: "live",
        crossesBorder: true,
        borderScore: 70,
      }),
    };

    expect(entry.risk.breakdown.factors.some((factor) => factor.id === "border")).toBe(true);
    const border = entry.risk.breakdown.factors.find((factor) => factor.id === "border");
    expect(border?.contribution).toBeGreaterThan(0);

    const result = assessReliability(entry.route, entry.risk);
    expect(result.riskLevel).toBe(entry.risk.level);
  });
});

describe("rankRoutes", () => {
  it("空輸入回傳空清單、null 推薦與提示", () => {
    const ranking = rankRoutes([]);

    expect(ranking.ranked).toEqual([]);
    expect(ranking.recommendedRouteId).toBeNull();
    expect(ranking.notices.length).toBeGreaterThan(0);
  });

  it("四種模式會產生不同排序，且最快與較不擠推薦不同路線", () => {
    const candidates: RankableRoute[] = [
      {
        route: { id: "fast_risky", label: "最快但高風險", quality: "live", journey: journey("fast_risky", "最快但高風險", 30, ["mtr"]) },
        risk: makeRisk({ routeId: "fast_risky", label: "最快但高風險", score: 80, quality: "live", crowdScore: 80 }),
      },
      {
        route: { id: "mid", label: "中庸", quality: "live", journey: journey("mid", "中庸", 33, ["mtr"]) },
        risk: makeRisk({ routeId: "mid", label: "中庸", score: 40, quality: "live", crowdScore: 50 }),
      },
      {
        route: { id: "slow_calm", label: "較慢但不擠", quality: "live", journey: journey("slow_calm", "較慢但不擠", 45, ["mtr"]) },
        risk: makeRisk({ routeId: "slow_calm", label: "較慢但不擠", score: 20, quality: "live", crowdScore: 10 }),
      },
    ];

    const modes: RouteMode[] = ["fastest", "reliable", "less_crowded", "balanced"];
    const rankings = modes.map((mode) => rankRoutes(candidates, { mode }));

    const fastest = rankings[0];
    const lessCrowded = rankings[2];
    expect(fastest?.recommendedRouteId).not.toBe(lessCrowded?.recommendedRouteId);
    expect(fastest?.recommendedRouteId).toBe("fast_risky");
    expect(lessCrowded?.recommendedRouteId).toBe("mid");

    const signatures = new Set(
      rankings.map((ranking) => ranking.ranked.map((item) => item.routeId).join(">")),
    );
    expect(signatures.size).toBeGreaterThanOrEqual(2);
  });

  it("排序具決定性：同一輸入兩次結果相等", () => {
    const candidates: RankableRoute[] = [
      route("a", "甲", 30, "live"),
      route("b", "乙", 45, "cached", ["mtr", "bus", "walk"]),
    ];

    const first = rankRoutes(candidates, { mode: "balanced" });
    const second = rankRoutes(candidates, { mode: "balanced" });
    expect(first).toEqual(second);

    const entry = candidates[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(assessReliability(entry.route, entry.risk)).toEqual(
      assessReliability(entry.route, entry.risk),
    );
  });
});
