/**
 * 風險引擎測試（成員 A）。
 *
 * 守住第二階段風險模型的核心保證：
 *   1. 境內 / 跨境的權重差異（border 只在跨境出現）
 *   2. 缺資料一律降級，且留下可讀的 notice（不得編造）
 *   3. 資料品質為 fixture 時不得宣稱 high 可信度
 *   4. 決定性：同一輸入兩次結果完全相同
 *   5. 每個因子都可溯源（claim / evidence / source 非空）
 *   6. 四種模式只調權重，不換算法
 *
 * 測試一律走 `resolveRoutes` 取得真實候選（離線 fixture），
 * 避免用手寫的假 Journey 掩蓋解析器與引擎之間的落差。
 */
import { describe, expect, it } from "vitest";
import { resolveRoutes } from "@/lib/route/adapter";
import { assessRouteRisk } from "@/lib/risk";
import { findRiskFactor } from "@/lib/types/risk";
import type { CandidateRoute } from "@/lib/types/route";
import type { RiskContext, RiskFactor, RiskFactorId, RouteRisk } from "@/lib/types/risk";

const DEPART = "2026-10-13T08:00";

const DOMESTIC = { origin: "hang-hau-estate", destination: "central-exchange-square" } as const;
const CROSS_BORDER = { origin: "central-exchange-square", destination: "futian-station-sz" } as const;

/** 取得指定走廊的第一條候選（已依總時間排序）。 */
async function firstCandidate(
  query: { origin: string; destination: string },
): Promise<CandidateRoute> {
  const { resolution } = await resolveRoutes({
    query: { origin: query.origin, destination: query.destination, departAt: DEPART },
  });
  const candidate = resolution.candidates[0];
  if (!candidate) throw new Error(`找不到 ${query.origin} → ${query.destination} 的候選路線。`);
  return candidate;
}

/** 取出指定因子；找不到即視為契約破裂，直接讓測試失敗。 */
function requireFactor(risk: RouteRisk, id: RiskFactorId): RiskFactor {
  const factor = findRiskFactor(risk, id);
  if (!factor) throw new Error(`風險結果缺少因子 ${id}。`);
  return factor;
}

describe("境內與跨境的權重差異", () => {
  it("境內候選：border 分數與權重皆為 0，只有四個非零權重因子", async () => {
    const route = await firstCandidate(DOMESTIC);
    const risk = assessRouteRisk(route, { quality: "fixture" });

    expect(risk.crossesBorder).toBe(false);
    const border = requireFactor(risk, "border");
    expect(border.score).toBe(0);
    expect(border.weight).toBe(0);
    expect(risk.breakdown.factors.filter((factor) => factor.weight > 0)).toHaveLength(4);
  });

  it("跨境候選：crossesBorder 為 true、border 權重 > 0，且五個因子齊全", async () => {
    const route = await firstCandidate(CROSS_BORDER);
    const risk = assessRouteRisk(route, { quality: "fixture" });

    expect(risk.crossesBorder).toBe(true);
    expect(requireFactor(risk, "border").weight).toBeGreaterThan(0);
    expect(risk.breakdown.factors).toHaveLength(5);
  });
});

describe("缺資料與品質降級（不得編造）", () => {
  it("只給 quality 的 context：可信度不得為 high，且留下缺資料 notice", async () => {
    const route = await firstCandidate(CROSS_BORDER);
    const risk = assessRouteRisk(route, { quality: "fixture" });

    expect(risk.breakdown.confidence).not.toBe("high");
    expect(risk.notices.some((notice) => notice.includes("缺少"))).toBe(true);
  });

  it("品質為 fixture 時，可信度不得為 high，並標示資料品質", async () => {
    const route = await firstCandidate(CROSS_BORDER);
    const risk = assessRouteRisk(route, { quality: "fixture" });

    expect(risk.breakdown.confidence).not.toBe("high");
    expect(risk.notices.some((notice) => notice.includes("資料品質"))).toBe(true);
  });

  it("路線本身是 live 但訊號品質為 fixture 時，仍不得宣稱 high", async () => {
    const route = await firstCandidate(CROSS_BORDER);
    const liveRoute: CandidateRoute = { ...route, quality: "live" };
    const risk = assessRouteRisk(liveRoute, { quality: "fixture" });

    expect(risk.breakdown.confidence).not.toBe("high");
  });
});

describe("決定性與可溯源", () => {
  const context: RiskContext = {
    quality: "live",
    weather: { condition: "rain", warning: null, updatedAt: "2026-10-13T07:50:00+08:00" },
    service: { status: "delayed", delayMinutes: 8, crowding: "medium" },
  };

  it("同一輸入呼叫兩次，結果完全相同", async () => {
    const route = await firstCandidate(CROSS_BORDER);
    expect(assessRouteRisk(route, context)).toEqual(assessRouteRisk(route, context));
  });

  it("每個因子都有非空的 claim / evidence / source", async () => {
    const route = await firstCandidate(CROSS_BORDER);
    const risk = assessRouteRisk(route, { quality: "fixture" });

    for (const factor of risk.breakdown.factors) {
      expect(factor.claim.length).toBeGreaterThan(0);
      expect(factor.evidence.length).toBeGreaterThan(0);
      expect(factor.source.length).toBeGreaterThan(0);
    }
  });
});

describe("邊界情境", () => {
  it("黑雨天氣 + 服務中斷 + 跨境排隊 → overall 為 high", async () => {
    const route = await firstCandidate(CROSS_BORDER);
    const portId = route.journey.borderPortIds[0] ?? "lok-ma-chau";
    const context: RiskContext = {
      quality: "live",
      weather: {
        condition: "heavy_rain",
        warning: "黑色暴雨警告信號",
        updatedAt: "2026-10-13T07:50:00+08:00",
      },
      service: { status: "disrupted", delayMinutes: 0, crowding: "high" },
      border: {
        portId,
        queueMinutesRange: [40, 60],
        confidence: "medium",
        note: "口岸排隊區間（估算）",
      },
    };

    const risk = assessRouteRisk(route, context);
    expect(risk.level).toBe("high");
    expect(risk.score).toBeGreaterThanOrEqual(70);
  });
});

describe("通關訊號的口岸比對（成員 C 按口岸輸出）", () => {
  it("注入口岸與行程不符時，改用行程自身的口岸排隊資料並留下提示", async () => {
    const route = await firstCandidate(CROSS_BORDER);
    const ownPort = route.journey.borderPortIds[0];
    if (!ownPort) throw new Error("測試前提：跨境候選應綁定口岸。");
    const ownQueue = route.journey.segments.find(
      (segment) => segment.kind === "border_crossing",
    )?.border;
    if (!ownQueue) throw new Error("測試前提：跨境候選應帶有通關排隊資料。");

    const foreignPortId = ownPort === "lo-wu" ? "shenzhen-bay" : "lo-wu";
    const risk = assessRouteRisk(route, {
      quality: "live",
      border: {
        portId: foreignPortId,
        queueMinutesRange: [40, 60],
        confidence: "medium",
        note: "注入估算",
      },
    });

    const expected = Math.min(100, Math.round(ownQueue.queueMinutesRange[1] * 2));
    expect(requireFactor(risk, "border").score).toBe(expected);
    expect(risk.notices.some((notice) => notice.includes("不符"))).toBe(true);
  });

  it("注入口岸與行程相同時，採用注入值", async () => {
    const route = await firstCandidate(CROSS_BORDER);
    const ownPort = route.journey.borderPortIds[0];
    if (!ownPort) throw new Error("測試前提：跨境候選應綁定口岸。");

    const risk = assessRouteRisk(route, {
      quality: "live",
      border: {
        portId: ownPort,
        queueMinutesRange: [40, 60],
        confidence: "medium",
        note: "注入估算",
      },
    });

    expect(requireFactor(risk, "border").score).toBe(Math.min(100, Math.round(60 * 2)));
  });
});

describe("四種模式只調權重", () => {
  it("less_crowded 下的 crowd 權重高於 fastest", async () => {
    const route = await firstCandidate(CROSS_BORDER);
    const context: RiskContext = { quality: "live" };

    const crowded = requireFactor(assessRouteRisk(route, context, { mode: "less_crowded" }), "crowd");
    const fastest = requireFactor(assessRouteRisk(route, context, { mode: "fastest" }), "crowd");

    expect(crowded.weight).toBeGreaterThan(fastest.weight);
    // 只調權重：同一因子的原始分數不因模式而變。
    expect(crowded.score).toBe(fastest.score);
  });
});
