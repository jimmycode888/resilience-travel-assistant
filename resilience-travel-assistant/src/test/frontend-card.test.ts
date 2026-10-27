import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DecisionCard } from "@/components/DecisionCard";
import { isDecisionResponse } from "@/lib/api-client";
import type { DecisionResponse } from "@/lib/types";
import normal from "@/lib/fixtures/golden/normal.json";

const keys = ["status", "departAt", "etaRange", "confidence", "primaryRoute", "planB", "switchCondition", "reasons", "dataUpdatedAt", "dataQuality"] as const;
const full = normal.decision as unknown as DecisionResponse;
const minimal = Object.fromEntries(keys.map((key) => [key, full[key]])) as unknown as DecisionResponse;
const render = (decision: DecisionResponse) => renderToStaticMarkup(createElement(DecisionCard, { decision }));

describe("前端鎖定契約呈現", () => {
  it("合法最小回應保留出發、信心、主路線、Plan B 和切換条件", () => {
    expect(isDecisionResponse(minimal)).toBe(true);
    const html = render(minimal);
    for (const value of ["08:09", "到達信心", "主路線", "Plan B", "切換條件", "演示固定資料"]) expect(html).toContain(value);
  });
  it("附加主路線摘要為 null 不隱藏鎖定路線", () => {
    expect(render({ ...minimal, primaryPlan: null })).toContain("08:09");
  });
  it("空 Plan B 有明確空狀態", () => {
    expect(render({ ...minimal, planB: [], switchCondition: "" })).toContain("沒有可用的備用路線");
  });
  it("unavailable 不展示空時間或假建議", () => {
    const html = render({ ...minimal, status: "unavailable", departAt: "", etaRange: ["", ""], primaryRoute: [], planB: [], switchCondition: "" });
    expect(html).toContain("目前沒有可執行的建議");
    expect(html).not.toContain("建議出發時間");
  });
});
