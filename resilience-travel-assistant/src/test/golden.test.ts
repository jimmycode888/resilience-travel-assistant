import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decideTrip } from "@/lib/decision";
import { demoRequestForFixture, DEMO_SCENARIOS } from "@/lib/fixtures/demo-request";
import { getFixtureSnapshot } from "@/lib/fixtures/context";
import type { ContextSnapshot, DecisionResponse, FixtureScenario, TripRequest } from "@/lib/types";

/**
 * 黃金檔案（golden fixtures）：三個情景的完整決策輸出。
 *
 * 用途：任何改動只要改變了使用者看到的建議，就會讓這個測試失敗，
 * 強迫作者明確決定是「刻意調整」還是「不小心改壞」。
 *
 * 刻意調整時執行：npm run fixtures:update
 */

const GOLDEN_DIR = fileURLToPath(new URL("../lib/fixtures/golden/", import.meta.url));
const UPDATE = process.env.UPDATE_FIXTURES === "1";

/** 與 fixtures 無關、只屬於黃金檔案的輸入，寫進檔案讓變更可被 review。 */
interface GoldenFile {
  description: string;
  request: TripRequest;
  snapshot: Pick<ContextSnapshot, "scenario" | "serviceDate" | "collectedAt" | "quality">;
  decision: DecisionResponse;
}

function goldenPath(scenario: FixtureScenario): string {
  return `${GOLDEN_DIR}${scenario}.json`;
}

function buildGolden(scenario: FixtureScenario): GoldenFile {
  const request = demoRequestForFixture(scenario);
  const snapshot = getFixtureSnapshot(scenario);
  return {
    description: `${scenario} 情景的確定性決策輸出（由 src/test/golden.test.ts 產生）`,
    request,
    snapshot: {
      scenario: snapshot.scenario,
      serviceDate: snapshot.serviceDate,
      collectedAt: snapshot.collectedAt,
      quality: snapshot.quality,
    },
    decision: decideTrip(request, snapshot),
  };
}

if (UPDATE) {
  mkdirSync(GOLDEN_DIR, { recursive: true });
  for (const scenario of DEMO_SCENARIOS) {
    writeFileSync(goldenPath(scenario), `${JSON.stringify(buildGolden(scenario), null, 2)}\n`, "utf8");
  }
  console.log(`已更新 ${DEMO_SCENARIOS.length} 個黃金檔案於 ${GOLDEN_DIR}`);
}

describe("黃金檔案比對", () => {
  it.each(DEMO_SCENARIOS)("%s 情景的決策輸出與黃金檔案完全一致", (scenario) => {
    let raw: string;
    try {
      raw = readFileSync(goldenPath(scenario), "utf8");
    } catch {
      throw new Error(
        `缺少黃金檔案 ${goldenPath(scenario)}。請先執行 npm run fixtures:update 產生。`,
      );
    }

    const golden = JSON.parse(raw) as GoldenFile;
    const current = buildGolden(scenario);

    expect(current.request).toEqual(golden.request);
    expect(current.decision).toEqual(golden.decision);
  });

  it("黃金檔案包含使用者看到的六項必要輸出", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const golden = JSON.parse(readFileSync(goldenPath(scenario), "utf8")) as GoldenFile;
      const { decision } = golden;
      expect(decision.departAt).not.toBe("");
      expect(decision.primaryRoute.length).toBeGreaterThan(0);
      expect(decision.etaRange[0]).not.toBe("");
      expect(["high", "medium", "low"]).toContain(decision.confidence);
      expect(decision.planB.length).toBeGreaterThan(0);
      expect(decision.switchCondition).not.toBe("");
      expect(decision.reasons.length).toBeGreaterThan(0);
      expect(decision.dataUpdatedAt).not.toBe("");
      expect(decision.dataQuality).toBe("fixture");
    }
  });
});
