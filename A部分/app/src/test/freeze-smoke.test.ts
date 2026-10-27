import { describe, expect, it } from "vitest";
import { resolveContext } from "@/lib/adapters";
import { handleDecisionRequest } from "@/lib/api/decision-handler";
import { demoRequestForFixture, DEMO_SCENARIOS } from "@/lib/fixtures/demo-request";
import { CONFIDENCE_LABELS, SCENARIO_LABELS } from "@/lib/labels";
import { formatHkTime } from "@/lib/time";
import type { DecisionResponse } from "@/lib/types";

/**
 * 功能凍結驗收（10 月 11 日）：
 * 三個情景各連續執行 5 次，全部必須成功且結果一致。
 *
 * 執行方式：npm run smoke
 */

const RUNS = 5;

interface RunRecord {
  scenario: string;
  run: number;
  status: string;
  confidence: string;
  departAt: string;
  primary: string;
  planB: string;
  fingerprint: string;
}

async function runOnce(
  scenario: (typeof DEMO_SCENARIOS)[number],
  run: number,
): Promise<{ record: RunRecord; decision: DecisionResponse }> {
  const result = await handleDecisionRequest(demoRequestForFixture(scenario), { resolveContext });
  expect(result.status, `${scenario} 第 ${run} 次執行應回傳 200`).toBe(200);

  const decision = result.body as DecisionResponse;
  return {
    decision,
    record: {
      scenario: SCENARIO_LABELS[scenario],
      run,
      status: decision.status,
      confidence: CONFIDENCE_LABELS[decision.confidence],
      departAt: formatHkTime(decision.departAt) || "—",
      primary: decision.primaryPlan?.routeId ?? "—",
      planB: decision.planBPlan?.routeId ?? "—",
      fingerprint: JSON.stringify(decision),
    },
  };
}

describe("功能凍結驗收：三個情景各 5 次", () => {
  it("全部執行成功、結果一致，且六項必要輸出齊全", async () => {
    const records: RunRecord[] = [];

    for (const scenario of DEMO_SCENARIOS) {
      for (let run = 1; run <= RUNS; run += 1) {
        const { decision, record } = await runOnce(scenario, run);
        records.push(record);

        // 六項必要輸出
        expect(decision.departAt).not.toBe("");
        expect(decision.primaryRoute.length).toBeGreaterThan(0);
        expect(decision.etaRange[0]).not.toBe("");
        expect(decision.etaRange[1]).not.toBe("");
        expect(["high", "medium", "low"]).toContain(decision.confidence);
        expect(decision.planB.length).toBeGreaterThan(0);
        expect(decision.switchCondition.length).toBeGreaterThan(0);
        expect(decision.reasons.length).toBeGreaterThan(0);
        expect(decision.dataUpdatedAt).not.toBe("");
        expect(["live", "cached", "fixture"]).toContain(decision.dataQuality);
      }
    }

    // 每個情景的 5 次結果必須完全一致。
    for (const scenario of DEMO_SCENARIOS) {
      const fingerprints = new Set(
        records.filter((record) => record.scenario === SCENARIO_LABELS[scenario]).map((record) => record.fingerprint),
      );
      expect(fingerprints.size, `${scenario} 的 ${RUNS} 次結果不一致`).toBe(1);
    }

    const summary = records
      .filter((record) => record.run === 1)
      .map(
        (record) =>
          `${record.scenario}｜狀態 ${record.status}｜信心 ${record.confidence}｜出發 ${record.departAt}｜主路線 ${record.primary}｜Plan B ${record.planB}`,
      );

    console.log(`\n功能凍結驗收（每個情景各 ${RUNS} 次，共 ${records.length} 次，全部成功）\n${summary.join("\n")}\n`);
    expect(records.length).toBe(DEMO_SCENARIOS.length * RUNS);
  }, 30_000);

  it("三個情景的建議彼此不同（不是複製同一份結果）", async () => {
    const firsts = await Promise.all(DEMO_SCENARIOS.map((scenario) => runOnce(scenario, 1)));
    const departures = firsts.map((item) => item.decision.departAt);
    expect(new Set(departures).size).toBe(DEMO_SCENARIOS.length);
    expect(new Set(firsts.map((item) => item.decision.primaryPlan?.routeId)).size).toBeGreaterThan(1);
    expect(new Set(firsts.map((item) => item.decision.confidence)).size).toBe(DEMO_SCENARIOS.length);
  });
});
