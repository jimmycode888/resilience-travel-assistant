import { describe, expect, it } from "vitest";
import { DEMO_REQUEST } from "@/lib/fixtures/demo-request";
import { buildResultPath, tripRequestFromSearchParams, tripRequestToSearchParams } from "@/lib/url-params";
import type { TripRequest } from "@/lib/types";

function roundTrip(request: TripRequest) {
  return tripRequestFromSearchParams(tripRequestToSearchParams(request));
}

describe("URL 參數編碼", () => {
  it("編碼後解碼可還原相同的請求", () => {
    const { request, issues } = roundTrip(DEMO_REQUEST);
    expect(issues).toEqual([]);
    expect(request).toEqual(DEMO_REQUEST);
  });

  it("結果頁路徑包含所有契約欄位", () => {
    const path = buildResultPath(DEMO_REQUEST);
    expect(path.startsWith("/result?")).toBe(true);
    for (const key of ["origin", "destination", "arriveBy", "maxExtraCost", "maxTransfers", "scenario"]) {
      expect(path).toContain(`${key}=`);
    }
  });

  it("缺少參數時使用示範預設值，並回報問題", () => {
    const { request, issues } = tripRequestFromSearchParams(new URLSearchParams());
    expect(request).toEqual(DEMO_REQUEST);
    expect(issues).toEqual([]);
  });

  it("無法辨識的地點會被回報並改用預設值", () => {
    const { request, issues } = roundTrip({ ...DEMO_REQUEST, origin: "旺角" });
    expect(issues.join(" ")).toContain("origin");
    expect(request.origin).toBe(DEMO_REQUEST.origin);
  });

  it("角色錯置的地點（把終點當起點）會被拒絕", () => {
    const { request, issues } = roundTrip({ ...DEMO_REQUEST, origin: "central-ifc" });
    expect(issues.length).toBeGreaterThan(0);
    expect(request.origin).toBe(DEMO_REQUEST.origin);
  });

  it("超出範圍的數字參數會被回報並改用預設值", () => {
    const params = new URLSearchParams({
      origin: DEMO_REQUEST.origin,
      destination: DEMO_REQUEST.destination,
      arriveBy: DEMO_REQUEST.arriveBy,
      maxExtraCost: "-5",
      maxTransfers: "99",
      scenario: "normal",
    });
    const { request, issues } = tripRequestFromSearchParams(params);
    expect(issues.length).toBe(2);
    expect(request.constraints).toEqual(DEMO_REQUEST.constraints);
  });

  it("未知情景會被回報並改用預設值", () => {
    const { request, issues } = roundTrip({ ...DEMO_REQUEST, scenario: "typhoon" as never });
    expect(issues.join(" ")).toContain("scenario");
    expect(request.scenario).toBe("normal");
  });
});
