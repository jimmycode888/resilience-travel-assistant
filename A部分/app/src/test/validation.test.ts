import { describe, expect, it } from "vitest";
import { DEMO_REQUEST } from "@/lib/fixtures/demo-request";
import { readFaultInjection, stripDebugFields, validateTripRequest } from "@/lib/validation";

const valid = {
  origin: "hang-hau-estate",
  destination: "central-exchange-square",
  arriveBy: "2026-10-13T09:00",
  constraints: { maxExtraCost: 10, maxTransfers: 2 },
  scenario: "normal",
};

describe("validateTripRequest", () => {
  it("接受合法的 TripRequest 並正規化 arriveBy", () => {
    const result = validateTripRequest(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.arriveBy).toBe("2026-10-13T09:00:00+08:00");
    expect(result.value.scenario).toBe("normal");
  });

  it("接受地點名稱而不只是 ID", () => {
    const result = validateTripRequest({ ...valid, origin: "坑口站 A 出口" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.origin).toBe("hang-hau-station");
  });

  it("拒絕未知欄位，避免各模組格式漂移", () => {
    const result = validateTripRequest({ ...valid, somethingNew: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.join(" ")).toContain("未知欄位");
  });

  it("拒絕 constraints 內的未知欄位", () => {
    const result = validateTripRequest({
      ...valid,
      constraints: { ...valid.constraints, extra: 1 },
    });
    expect(result.ok).toBe(false);
  });

  it.each([
    ["缺少 scenario", { ...valid, scenario: undefined }],
    ["未知情景", { ...valid, scenario: "typhoon" }],
    ["負數費用", { ...valid, constraints: { maxExtraCost: -1, maxTransfers: 2 } }],
    ["非整數轉乘", { ...valid, constraints: { maxExtraCost: 0, maxTransfers: 1.5 } }],
    ["轉乘過多", { ...valid, constraints: { maxExtraCost: 0, maxTransfers: 99 } }],
    ["空 origin", { ...valid, origin: "" }],
    ["origin 不是起點", { ...valid, origin: "central-exchange-square" }],
    ["destination 不是終點", { ...valid, destination: "hang-hau-estate" }],
    ["不存在的日期", { ...valid, arriveBy: "2026-02-30T09:00" }],
    ["無法辨識的時間", { ...valid, arriveBy: "下星期三" }],
    ["非物件", "not-an-object"],
    ["null", null],
  ])("拒絕無效輸入：%s", (_label, input) => {
    const result = validateTripRequest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.details.length).toBeGreaterThan(0);
  });

  it("缺漏的欄位會產生可讀的中文訊息", () => {
    const result = validateTripRequest({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.join("\n")).toMatch(/origin|destination|arriveBy|constraints|scenario/);
  });
});

describe("除錯欄位處理", () => {
  it("stripDebugFields 移除 faultInjection 但不動其他欄位", () => {
    const stripped = stripDebugFields({ ...valid, faultInjection: "internal_error" }) as Record<
      string,
      unknown
    >;
    expect(stripped.faultInjection).toBeUndefined();
    expect(stripped.origin).toBe(valid.origin);
  });

  it("readFaultInjection 只接受已知值", () => {
    expect(readFaultInjection({ faultInjection: "delay" })).toBe("delay");
    expect(readFaultInjection({ faultInjection: "explode" })).toBeNull();
    expect(readFaultInjection(null)).toBeNull();
  });
});

describe("示範請求", () => {
  it("示範請求本身通過驗證（避免 demo 壞在輸入層）", () => {
    const result = validateTripRequest(DEMO_REQUEST);
    expect(result.ok).toBe(true);
  });
});
