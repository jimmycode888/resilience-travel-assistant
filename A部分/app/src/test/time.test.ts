import { describe, expect, it } from "vitest";
import {
  addMinutes,
  diffMinutes,
  formatHkTime,
  hkDateOf,
  hkIsoFromMinutes,
  hkMinutesOfDay,
  parseArriveBy,
  toHkIso,
} from "@/lib/time";

describe("parseArriveBy", () => {
  it("把不帶偏移量的時間解讀為香港時間", () => {
    const result = parseArriveBy("2026-10-13T09:00");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.iso).toBe("2026-10-13T09:00:00+08:00");
    expect(result.hkDate).toBe("2026-10-13");
  });

  it("接受帶 Z 的 UTC 時間並轉成香港時間", () => {
    const result = parseArriveBy("2026-10-13T01:00:00Z");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.iso).toBe("2026-10-13T09:00:00+08:00");
  });

  it("接受帶偏移量的 ISO 時間", () => {
    const result = parseArriveBy("2026-10-13T09:00:00+08:00");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.iso).toBe("2026-10-13T09:00:00+08:00");
  });

  it("跨越日期邊界時回報正確的香港日期", () => {
    const result = parseArriveBy("2026-10-12T18:00:00Z");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hkDate).toBe("2026-10-13");
    expect(result.iso).toBe("2026-10-13T02:00:00+08:00");
  });

  it.each([
    ["2026-02-30T09:00", "不存在的日期"],
    ["2026-10-13T25:00", "不存在的時間"],
    ["", "空字串"],
    ["明天早上九點", "無法辨識的格式"],
    ["2026/10/13 09:00", "錯誤的分隔符"],
  ])("拒絕無效輸入：%s（%s）", (input) => {
    const result = parseArriveBy(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe("香港時區工具", () => {
  it("addMinutes 與 diffMinutes 互為反向運算", () => {
    const start = "2026-10-13T08:09:00+08:00";
    const later = addMinutes(start, 45);
    expect(later).toBe("2026-10-13T08:54:00+08:00");
    expect(diffMinutes(later, start)).toBe(45);
  });

  it("跨日加分鐘仍然產生香港時區 ISO 字串", () => {
    expect(addMinutes("2026-10-13T23:50:00+08:00", 20)).toBe("2026-10-14T00:10:00+08:00");
  });

  it("減去分鐘可跨回前一天", () => {
    expect(addMinutes("2026-10-13T00:20:00+08:00", -40)).toBe("2026-10-12T23:40:00+08:00");
  });

  it("顯示用的時間格式固定為 HH:mm", () => {
    expect(formatHkTime("2026-10-13T07:22:00+08:00")).toBe("07:22");
    expect(formatHkTime("")).toBe("—");
  });

  it("hkIsoFromMinutes 由當日分鐘數產生時間", () => {
    expect(hkIsoFromMinutes("2026-10-13", 5 * 60 + 30)).toBe("2026-10-13T05:30:00+08:00");
  });

  it("hkDateOf / hkMinutesOfDay 以香港時區為準", () => {
    const iso = "2026-10-12T23:30:00+08:00";
    expect(hkDateOf(iso)).toBe("2026-10-12");
    expect(hkMinutesOfDay(iso)).toBe(23 * 60 + 30);
  });

  it("不同伺服器時區不影響輸出（toHkIso 為純函式）", () => {
    const epoch = Date.parse("2026-10-13T09:00:00+08:00");
    expect(toHkIso(epoch)).toBe("2026-10-13T09:00:00+08:00");
  });
});
