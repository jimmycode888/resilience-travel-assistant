import { describe, expect, it } from "vitest";
import { resolveContext } from "@/lib/adapters";
import { handleDecisionRequest } from "@/lib/api/decision-handler";
import { demoRequestForFixture, DEMO_SCENARIOS } from "@/lib/fixtures/demo-request";
import type { DecisionResponse } from "@/lib/types";

/**
 * 確定性驗收：同一份請求重複執行必須得到位元組級相同的結果。
 * 這是「重新整理頁面與重複提交不會產生隨機結果」的自動化證明。
 */

async function call(scenario: (typeof DEMO_SCENARIOS)[number]): Promise<DecisionResponse> {
  const result = await handleDecisionRequest(demoRequestForFixture(scenario), {
    resolveContext,
  });
  if (result.status !== 200) {
    throw new Error(`預期 200，收到 ${result.status}`);
  }
  return result.body as DecisionResponse;
}

describe("確定性", () => {
  it.each(DEMO_SCENARIOS)("%s：連續呼叫 10 次結果完全相同", async (scenario) => {
    const results = [];
    for (let index = 0; index < 10; index += 1) {
      results.push(JSON.stringify(await call(scenario)));
    }
    expect(new Set(results).size).toBe(1);
  });

  it("決策引擎不依賴系統時鐘：不同呼叫時間得到相同結果", async () => {
    const before = JSON.stringify(await call("normal"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const after = JSON.stringify(await call("normal"));
    expect(after).toBe(before);
  });

  it("回應中沒有任何看起來像隨機或時間戳亂數的欄位", async () => {
    const decision = await call("disruption");
    const serialized = JSON.stringify(decision);
    // dataUpdatedAt 必須等於 fixture 的固定擷取時間，而不是「現在」。
    expect(decision.dataUpdatedAt).toBe("2026-10-13T07:30:00+08:00");
    expect(serialized).not.toMatch(/Math\.random|NaN|Infinity/);
    expect(serialized).not.toContain("undefined");
  });

  it("重複提交的結果與第一次提交相同（模擬使用者連按送出）", async () => {
    const payload = demoRequestForFixture("heavy_rain");
    const responses = await Promise.all(
      Array.from({ length: 5 }, async () =>
        JSON.stringify(await handleDecisionRequest(payload, { resolveContext })),
      ),
    );
    expect(new Set(responses).size).toBe(1);
  });
});
