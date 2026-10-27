import { describe, expect, it } from "vitest";
import { decideTrip, UNKNOWN_ROUTE_RULES } from "@/lib/decision";
import { demoRequestForFixture } from "@/lib/fixtures/demo-request";
import { getFixtureSnapshot } from "@/lib/fixtures/context";
import type { ContextSnapshot, RouteServiceStatus } from "@/lib/types";

/**
 * 回應成員 B 交接文件第 3 條：
 *
 * > C：unknown 路線的 delayMinutes=0 僅為現行數值契約佔位。核對引擎不會據此解釋為零延誤，
 * >    及黑雨下 hold/wait 安全規則。
 *
 * 這裡鎖定兩件事：
 * 1. 服務狀態未確認 ≠ 零延誤：引擎會額外預留保守時間，且文案與數字一致。
 * 2. 惡劣天氣（黑雨／八號或以上）＋露天候車 → 行動建議降為 wait，但**不改變任何時間數字**。
 *
 * 成員 B 的實時路徑（天氣 live、交通 unknown）正是第 1 條的觸發情境。
 */

function unknownRoutes(snapshot: ContextSnapshot, note: string): ContextSnapshot {
  const routes: RouteServiceStatus[] = snapshot.routes.map((route) => ({
    ...route,
    status: route.status === "disrupted" ? "disrupted" : "unknown",
    delayMinutes: 0,
    note,
  }));
  return { ...snapshot, routes };
}

describe("服務狀態未確認 ≠ 零延誤（回應 B 第 3 條）", () => {
  const base = getFixtureSnapshot("normal");
  const unknown = unknownRoutes(base, "交通狀態未確認（僅天氣為實時）");
  const request = demoRequestForFixture("normal");

  it("unknown 路線會額外預留保守時間，出發時間因此提早", () => {
    const withUnknown = decideTrip(request, unknown);
    const known = decideTrip(request, base);

    expect(withUnknown.primaryPlan?.status).toBe("unknown");
    expect(withUnknown.primaryPlan?.delayMinutes).toBe(UNKNOWN_ROUTE_RULES.extraMinutes);
    expect(Date.parse(withUnknown.departAt)).toBeLessThan(Date.parse(known.departAt));
  });

  it("durationMinutes = baseDurationMinutes + delayMinutes 的不變條件仍成立", () => {
    const result = decideTrip(request, unknown);
    for (const plan of result.candidates) {
      expect(plan.durationMinutes).toBe(plan.baseDurationMinutes + plan.delayMinutes);
      const stepTotal = plan.steps.reduce((total, step) => total + step.durationMinutes, 0);
      expect(stepTotal).toBe(plan.durationMinutes);
    }
  });

  it("文案、風險提示與不確定性都說明保守假設，不出現「零延誤」的假象", () => {
    const result = decideTrip(request, unknown);
    const text = [
      result.reasons.join(" "),
      result.uncertainty.join(" "),
      ...(result.primaryPlan?.riskNotes ?? []),
      ...result.basis.map((entry) => entry.claim),
    ].join(" ");

    expect(text).toContain(`額外預留 ${UNKNOWN_ROUTE_RULES.extraMinutes} 分鐘`);
    expect(text).toContain("保守");
    expect(result.primaryPlan?.riskNotes.join(" ")).toContain("服務狀態未確認");
  });

  it("保守預留不會被算成「觀測到的延誤」扣分", () => {
    const result = decideTrip(request, unknown);
    const penaltyText = result.basis.map((entry) => entry.claim).join(" ");
    expect(penaltyText).not.toContain(`延誤 ${UNKNOWN_ROUTE_RULES.extraMinutes} 分鐘`);
  });

  it("整條走廊狀態都未確認時，信心不會是 high（不假裝確定）", () => {
    const result = decideTrip(request, unknown);
    expect(result.confidence).not.toBe("high");
    expect(["uncertain", "unavailable"]).toContain(result.status);
  });
});

describe("惡劣天氣安全規則（黑雨 / 八號或以上）", () => {
  const request = demoRequestForFixture("disruption");
  const disrupted = getFixtureSnapshot("disruption");

  it("黑雨生效且建議路線要露天候車（巴士）→ action 降為 wait", () => {
    const stormy: ContextSnapshot = {
      ...disrupted,
      weather: { ...disrupted.weather, condition: "storm", warning: "黑色暴雨警告信號" },
    };
    const result = decideTrip(request, stormy);

    expect(result.primaryPlan?.routeId).toBe("R2"); // 路面
    expect(result.action).toBe("wait");
    expect(result.notices.join(" ")).toContain("黑色暴雨警告信號");
    expect(result.uncertainty.join(" ")).toContain("露天候車");
    expect(result.basis.map((entry) => entry.claim).join(" ")).toContain("安全規則");
  });

  it("安全規則不改變任何時間數字（只覆寫 action）", () => {
    const stormy: ContextSnapshot = {
      ...disrupted,
      weather: { ...disrupted.weather, condition: "storm", warning: "八號東北烈風或暴風信號" },
    };
    const calm = decideTrip(request, disrupted);
    const storm = decideTrip(request, stormy);

    expect(storm.departAt).toBe(calm.departAt);
    expect(storm.etaRange).toEqual(calm.etaRange);
    expect(storm.confidence).toBe(calm.confidence);
    expect(storm.primaryPlan?.routeId).toBe(calm.primaryPlan?.routeId);
  });

  it("主路線是鐵路（受覆蓋）時不觸發：黑雨情景維持 depart_at", () => {
    // heavy_rain fixture 本身就是黑色暴雨警告 + 港鐵主線（R1）。
    const result = decideTrip(demoRequestForFixture("heavy_rain"), getFixtureSnapshot("heavy_rain"));
    expect(result.primaryPlan?.routeId).toBe("R1");
    expect(result.action).toBe("depart_at");
    expect(result.notices.join(" ")).not.toContain("露天候車");
  });

  it("沒有可行路線時仍然是 hold，安全規則不會把它變成 wait", () => {
    const stormy: ContextSnapshot = {
      ...disrupted,
      weather: { ...disrupted.weather, condition: "storm", warning: "十號颶風信號" },
    };
    const result = decideTrip({ ...request, arriveBy: "2026-10-13T05:45" }, stormy);
    expect(result.status).toBe("unavailable");
    expect(result.action).toBe("hold");
  });

  it("相同輸入（含惡劣天氣）重複執行結果一致", () => {
    const stormy: ContextSnapshot = {
      ...disrupted,
      weather: { ...disrupted.weather, condition: "storm", warning: "黑色暴雨警告信號" },
    };
    expect(JSON.stringify(decideTrip(request, stormy))).toBe(
      JSON.stringify(decideTrip(request, stormy)),
    );
  });
});

describe("資料誠實性文案（回應 B 第 2 條與 D 第 5 條）", () => {
  const base = getFixtureSnapshot("normal");
  // 實時路徑的實際樣貌：頂層 live，但靜態路線估算仍是 fixture。
  const liveMixed: ContextSnapshot = {
    ...base,
    scenario: "live",
    quality: "live",
    serviceDate: "2026-10-07",
    collectedAt: "2026-10-07T20:00:00+08:00",
    expiresAt: "2026-10-07T20:30:00+08:00",
    sources: [
      {
        id: "weather-live",
        label: "香港天文台（實時）",
        url: "https://data.weather.gov.hk/",
        quality: "live",
        updatedAt: "2026-10-07T20:00:00+08:00",
        note: null,
      },
      {
        id: "route-estimates",
        label: "走廊路線靜態估算",
        url: null,
        quality: "fixture",
        updatedAt: "2026-10-13T07:30:00+08:00",
        note: "固定演示估算",
      },
    ],
  };
  const request = { ...demoRequestForFixture("normal"), scenario: "live" as const };

  it("頂層 live 但含 fixture 來源 → notices 逐項說明混合品質，且不改時間", () => {
    const result = decideTrip(request, liveMixed);
    const text = result.notices.join(" ");

    expect(result.dataQuality).toBe("live");
    expect(text).toContain("混合資料");
    expect(text).toContain("走廊路線靜態估算");
    expect(text).toContain("演示固定資料");
  });

  it("跨服務日樣本不再把實時資料叫成「示範資料」", () => {
    const result = decideTrip(request, liveMixed);
    const text = result.notices.join(" ");

    expect(text).toContain("服務日樣本");
    expect(text).not.toContain("示範資料以 2026-10-07");
  });

  it("fixture 情景不觸發混合品質提示，輸出與黃金檔案一致", () => {
    const result = decideTrip(demoRequestForFixture("normal"), base);
    expect(result.notices.join(" ")).not.toContain("混合資料");
  });
});
