import { describe, expect, it } from "vitest";
import {
  buildTemplateExplanation,
  collectAllowedFacts,
  explainDecision,
  extractClaimedFacts,
  validateExplanation,
} from "@/lib/decision";
import type { DecisionResponse } from "@/lib/types";
import normal from "@/lib/fixtures/golden/normal.json";
import disruption from "@/lib/fixtures/golden/disruption.json";

/**
 * GenAI 解釋層（C 指令第 9 項）：
 * - 沒有金鑰 / 模型失敗 → 模板文案，行為一致；
 * - 模型只能用 basis / 回應既有事實，任何無出處的時刻、數字、路線 ID 都必須被拒；
 * - 解釋層永遠不改變決策結果。
 */
const response = normal.decision as unknown as DecisionResponse;
const disrupted = disruption.decision as unknown as DecisionResponse;

describe("解釋模板與白名單", () => {
  it("模板文案只重組既有內容，且本身通過白名單校驗", () => {
    for (const sample of [response, disrupted]) {
      const text = buildTemplateExplanation(sample);
      expect(text.length).toBeGreaterThan(0);
      expect(validateExplanation(text, sample)).toEqual([]);
    }
  });

  it("模板包含行動建議與信心，且可重現", () => {
    const first = buildTemplateExplanation(response);
    expect(first).toContain("行動建議");
    expect(first).toContain("到達信心");
    expect(buildTemplateExplanation(response)).toBe(first);
  });

  it("抽取器能抓出時刻、數字與路線 ID", () => {
    const claimed = extractClaimedFacts("請於 09:59 改乘 R9，需 987654 分鐘。");
    expect(claimed.times).toContain("09:59");
    expect(claimed.routes).toContain("R9");
    expect(claimed.numbers).toContain("987654");
  });

  it("白名單拒絕無出處的時刻／路線／數字", () => {
    expect(validateExplanation("建議 09:59 出發。", response).join(" ")).toContain("09:59");
    expect(validateExplanation("改乘 R9 即可。", response).join(" ")).toContain("R9");
    expect(validateExplanation("全程 987654 分鐘。", response).join(" ")).toContain("987654");
  });

  it("允許引用回應本身已有的時刻與路線", () => {
    const depart = response.departAt.slice(11, 16);
    const routeId = response.primaryPlan?.routeId ?? "R1";
    expect(validateExplanation(`建議 ${depart} 出發，乘 ${routeId}。`, response)).toEqual([]);
  });

  it("空字串與過長文字被拒", () => {
    expect(validateExplanation("   ", response)).toContain("解釋為空");
    expect(validateExplanation("好".repeat(700), response).join(" ")).toContain("過長");
  });

  it("allowed facts 以 basis 與 reasons 為主", () => {
    const allowed = collectAllowedFacts(response);
    expect(allowed.facts.length).toBeGreaterThan(0);
    expect(allowed.facts.join(" ")).toContain(response.basis[0]!.claim);
    expect(allowed.times.has(response.departAt.slice(11, 16))).toBe(true);
  });
});

describe("explainDecision 的回退鏈", () => {
  it("沒有模型 → 直接使用模板（不需要任何 API Key）", async () => {
    const result = await explainDecision(response);
    expect(result.source).toBe("template");
    expect(result.reason).toBe("no_model");
    expect(result.text).toBe(buildTemplateExplanation(response));
  });

  it("模型輸出通過校驗時採用模型文字", async () => {
    const result = await explainDecision(response, {
      model: ({ response: r }) => `重點：${r.reasons[0]}`,
    });
    expect(result.source).toBe("model");
    expect(result.text).toContain("重點：");
  });

  it("模型捏造事實 → 整段退回模板並記錄原因", async () => {
    const result = await explainDecision(response, {
      model: () => "建議 09:59 改乘 R9。",
    });
    expect(result.source).toBe("template");
    expect(result.reason).toContain("rejected");
    expect(result.text).toBe(buildTemplateExplanation(response));
  });

  it("模型拋錯 → 回退模板", async () => {
    const result = await explainDecision(response, {
      model: () => {
        throw new Error("模型不可用");
      },
    });
    expect(result.source).toBe("template");
    expect(result.reason).toContain("model_error");
  });

  it("模型回傳空字串 → 回退模板", async () => {
    const result = await explainDecision(response, { model: () => "   " });
    expect(result.source).toBe("template");
    expect(result.reason).toBe("empty_model_output");
  });

  it("模型逾時 → 回退模板", async () => {
    const result = await explainDecision(response, {
      timeoutMs: 20,
      model: () => new Promise<string>(() => {}),
    });
    expect(result.source).toBe("template");
    expect(result.reason).toContain("model_error");
  });

  it("解釋層不改變決策結果", async () => {
    const before = JSON.stringify(response);
    const accepted = await explainDecision(response, { model: () => buildTemplateExplanation(response) });
    const rejected = await explainDecision(response, { model: () => "捏造 987654" });
    expect(accepted.source).toBe("model");
    expect(rejected.source).toBe("template");
    expect(JSON.stringify(response)).toBe(before);
  });
});
