import { describe, expect, it } from "vitest";
import { decideTrip } from "@/lib/decision";
import { demoRequestForFixture, DEMO_SCENARIOS } from "@/lib/fixtures/demo-request";
import { getFixtureSnapshot } from "@/lib/fixtures/context";
import { formatHkTime } from "@/lib/time";
import type { ContextSnapshot, FixtureScenario, TripRequest } from "@/lib/types";

/**
 * 行動建議層（action / switchDeadline / basis / uncertainty）的回歸測試。
 *
 * 這四個欄位由 C 的介面契約 v1 接入，全部是 additive：
 * 它們只描述規則層已經算出的事實，不得改變 departAt、etaRange、路線或信心。
 */

function decideFor(scenario: FixtureScenario, now?: string) {
  return decideTrip(demoRequestForFixture(scenario), getFixtureSnapshot(scenario), { now });
}

const NORMAL_DEPART = "2026-10-13T08:09:00+08:00";

describe("action：把 status 翻譯成可執行的下一步", () => {
  it.each(DEMO_SCENARIOS)("%s 情景在沒有注入時鐘時是 depart_at", (scenario) => {
    expect(decideFor(scenario).action).toBe("depart_at");
  });

  it("現在時間已達建議出發時間 → depart_now", () => {
    const result = decideFor("normal", NORMAL_DEPART);
    expect(result.action).toBe("depart_now");
    expect(result.departAt).toBe(NORMAL_DEPART);
  });

  it("已超過最遲起程時間 → depart_now，並在 notices 與 uncertainty 說明", () => {
    const result = decideFor("normal", "2026-10-13T08:30:00+08:00");
    expect(result.action).toBe("depart_now");
    expect(result.notices.join(" ")).toContain("超過最遲起程時間");
    expect(result.uncertainty.join(" ")).toContain("準時到達已無法保證");
  });

  it("資料過期（live 資料 + 注入時鐘）→ wait，status 仍為 uncertain", () => {
    const expired: ContextSnapshot = {
      ...getFixtureSnapshot("normal"),
      quality: "live",
      collectedAt: "2026-10-13T07:30:00+08:00",
      expiresAt: "2026-10-13T08:00:00+08:00",
    };
    const result = decideTrip(demoRequestForFixture("normal"), expired, {
      now: "2026-10-13T08:05:00+08:00",
    });
    expect(result.action).toBe("wait");
    expect(result.status).toBe("uncertain");
    expect(result.confidence).toBe("low");
  });

  it("沒有可行路線 → hold，且不提供出發時間", () => {
    const request: TripRequest = {
      ...demoRequestForFixture("normal"),
      arriveBy: "2026-10-13T05:45",
    };
    const result = decideTrip(request, getFixtureSnapshot("normal"));
    expect(result.status).toBe("unavailable");
    expect(result.action).toBe("hold");
    expect(result.departAt).toBe("");
    expect(result.switchDeadline).toBe("");
    expect(result.uncertainty.join(" ")).toContain("不提供出發建議");
  });

  it("action 不會改變 status 的語意", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const result = decideFor(scenario);
      if (result.status === "unavailable") {
        expect(result.action).toBe("hold");
      } else {
        expect(["depart_at", "depart_now", "wait"]).toContain(result.action);
      }
    }
  });
});

describe("switchDeadline：切換條件的機器可讀版本", () => {
  it("每個情景的 switchDeadline 都與 switchCondition 文字一致（HH:mm）", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const result = decideFor(scenario);
      expect(result.switchDeadline).not.toBe("");
      const clock = formatHkTime(result.switchDeadline);
      expect(result.switchCondition).toContain(clock);
    }
  });

  it("沒有 Plan B 時 switchDeadline 為空字串", () => {
    const request: TripRequest = {
      ...demoRequestForFixture("normal"),
      constraints: { maxExtraCost: 0, maxTransfers: 5 },
    };
    const result = decideTrip(request, getFixtureSnapshot("normal"));
    // 只有一條路線通過限制時，Plan B 為空。
    if (result.planB.length === 0) {
      expect(result.switchDeadline).toBe("");
    } else {
      expect(result.switchDeadline).not.toBe("");
    }
  });
});

describe("basis：每個數字帶出處", () => {
  it.each(DEMO_SCENARIOS)("%s 情景的依據包含規則與資料兩種來源", (scenario) => {
    const basis = decideFor(scenario).basis;
    expect(basis.length).toBeGreaterThan(0);
    expect(basis.map((entry) => entry.type)).toContain("rule");
    expect(basis.map((entry) => entry.type)).toContain("data");
    for (const entry of basis) {
      expect(entry.claim.length).toBeGreaterThan(0);
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.sourceUrl === null || typeof entry.sourceUrl === "string").toBe(true);
    }
  });

  it("沒有歷史校準時，不得出現 statistics 類型的依據", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const basis = decideFor(scenario).basis;
      expect(basis.some((entry) => entry.type === "statistics")).toBe(false);
      expect(basis.map((entry) => entry.claim).join(" ")).toContain("未經歷史資料校準");
    }
  });

  it("unavailable 情景仍然有依據與不確定性說明，不會白屏", () => {
    const result = decideTrip(
      { ...demoRequestForFixture("normal"), arriveBy: "2026-10-13T05:45" },
      getFixtureSnapshot("normal"),
    );
    expect(result.basis.length).toBeGreaterThan(0);
    expect(result.uncertainty.length).toBeGreaterThan(0);
    expect(result.basis.every((entry) => entry.claim.length > 0)).toBe(true);
  });
});

describe("uncertainty：誠實列出不知道什麼", () => {
  it.each(DEMO_SCENARIOS)("%s 情景一定會標示資料品質與後果", (scenario) => {
    const result = decideFor(scenario);
    const text = result.uncertainty.join(" ");
    expect(result.uncertainty.length).toBeGreaterThan(0);
    expect(text).toContain("演示固定資料");
    expect(text).toContain("不構成出行保證");
  });

  it("資料過期時明確說明過期時間", () => {
    const expired: ContextSnapshot = {
      ...getFixtureSnapshot("normal"),
      quality: "cached",
      collectedAt: "2026-10-13T07:30:00+08:00",
      expiresAt: "2026-10-13T08:00:00+08:00",
    };
    const result = decideTrip(demoRequestForFixture("normal"), expired, {
      now: "2026-10-13T08:05:00+08:00",
    });
    expect(result.uncertainty.join(" ")).toContain("2026-10-13 08:00");
  });
});

describe("additive 欄位不影響既有契約", () => {
  it.each(DEMO_SCENARIOS)("%s 情景的三項必要輸出維持不變", (scenario) => {
    const result = decideFor(scenario);
    expect(result.departAt).not.toBe("");
    expect(result.primaryRoute.length).toBeGreaterThan(0);
    expect(result.switchCondition.length).toBeGreaterThan(0);
    expect(["ready", "uncertain", "unavailable"]).toContain(result.status);
    expect(["high", "medium", "low"]).toContain(result.confidence);
  });

  it("重複呼叫得到完全相同的 action / basis / uncertainty", () => {
    const first = JSON.stringify(decideFor("disruption", NORMAL_DEPART));
    const second = JSON.stringify(decideFor("disruption", NORMAL_DEPART));
    expect(second).toBe(first);
  });
});
