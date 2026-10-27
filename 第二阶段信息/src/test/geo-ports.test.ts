/**
 * 口岸與地點判定測試（跨境重點）。
 *
 * 這一組測試守住跨境功能最容易出錯的地方：
 * 口岸開放時間、兩側節點判定、以及「未知地點要用推斷且標示為推斷」。
 */
import { describe, expect, it } from "vitest";
import {
  findPort,
  formatOpenHours,
  isPortOpen,
  matchPortNode,
  nearestPortNode,
  portBetween,
  portsOnSide,
  portsOpenAt,
} from "@/lib/geo/ports";
import { listPlaces, resolvePlace, searchPlaces } from "@/lib/geo/places";

const DAY = "2026-10-13";

function hkIso(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${DAY}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`;
}

describe("口岸開放時間", () => {
  const lokMaChau = findPort("lok-ma-chau");
  const huanggang = findPort("huanggang");
  const loWu = findPort("lo-wu");

  it("已註冊的口岸都能查到", () => {
    expect(lokMaChau).toBeDefined();
    expect(huanggang).toBeDefined();
    expect(loWu).toBeDefined();
  });

  it("落馬洲支線在開放時間外不開放（深夜不得作為 Plan B）", () => {
    expect(lokMaChau && isPortOpen(lokMaChau, hkIso(6 * 60))).toBe(false);
    expect(lokMaChau && isPortOpen(lokMaChau, hkIso(7 * 60))).toBe(true);
    expect(lokMaChau && isPortOpen(lokMaChau, hkIso(22 * 60 + 29))).toBe(true);
    expect(lokMaChau && isPortOpen(lokMaChau, hkIso(23 * 60))).toBe(false);
  });

  it("皇崗口岸 24 小時開放", () => {
    expect(huanggang && isPortOpen(huanggang, hkIso(3 * 60))).toBe(true);
    expect(huanggang && formatOpenHours(huanggang)).toBe("24 小時");
  });

  it("開放至 24:00 的口岸在 23:59 仍算開放", () => {
    expect(loWu && isPortOpen(loWu, hkIso(23 * 60 + 59))).toBe(true);
  });

  it("凌晨只有 24 小時口岸開放", () => {
    const open = portsOpenAt(hkIso(3 * 60)).map((port) => port.id);
    expect(open).toEqual(["huanggang"]);
  });

  it("早上七點有多個口岸可選", () => {
    const open = portsOpenAt(hkIso(7 * 60)).map((port) => port.id);
    expect(open).toContain("lok-ma-chau");
    expect(open).toContain("lo-wu");
    expect(open).toContain("huanggang");
  });
});

describe("口岸兩側節點判定", () => {
  it("落馬洲站判為香港側", () => {
    const match = matchPortNode(22.5145, 114.0656);
    expect(match?.port.id).toBe("lok-ma-chau");
    expect(match?.side).toBe("hk");
  });

  it("福田口岸判為深圳側", () => {
    const match = matchPortNode(22.519, 114.068);
    expect(match?.port.id).toBe("lok-ma-chau");
    expect(match?.side).toBe("sz");
  });

  it("市區地點不會被誤判為口岸", () => {
    expect(matchPortNode(22.282, 114.158)).toBeNull();
  });

  it("跨口岸的兩端會綁到同一個口岸", () => {
    const port = portBetween(22.5145, 114.0656, 22.519, 114.068);
    expect(port?.id).toBe("lok-ma-chau");
  });

  it("深圳灣口岸的香港側與深圳側各自判定正確", () => {
    expect(matchPortNode(22.502, 113.944)?.side).toBe("hk");
    expect(matchPortNode(22.505, 113.95)?.side).toBe("sz");
  });

  it("提供兩側節點清單供 Plan B 使用", () => {
    const hkNodes = portsOnSide("hk");
    expect(hkNodes.length).toBeGreaterThan(0);
    expect(hkNodes.every((node) => node.portId !== "")).toBe(true);
  });
});

describe("地點解析與跨境側別", () => {
  it("註冊地點回報 registry 來源", () => {
    const place = resolvePlace({ name: "中環站", lat: 22.282, lon: 114.158 });
    expect(place.side).toBe("hk");
    expect(place.sideSource).toBe("registry");
  });

  it("深圳地點判為深圳側", () => {
    const place = resolvePlace({ name: "福田", lat: 22.539, lon: 114.057 });
    expect(place.side).toBe("sz");
  });

  it("未知地點用最近口岸推斷並標示為 heuristic", () => {
    const place = resolvePlace({ name: "某個未註冊的地點", lat: 22.54, lon: 114.06 });
    expect(place.sideSource).toBe("heuristic");
    expect(place.side).toBe("sz");
  });

  it("未知的香港地點推斷為香港側", () => {
    const place = resolvePlace({ name: "未註冊的港島地點", lat: 22.28, lon: 114.15 });
    expect(place.side).toBe("hk");
  });

  it("最近口岸對市區地點仍能給出合理側別", () => {
    expect(nearestPortNode(22.282, 114.158).side).toBe("hk");
    expect(nearestPortNode(22.539, 114.057).side).toBe("sz");
  });

  it("搜尋支援深圳側地名（跨境需要的入口）", () => {
    const results = searchPlaces("福田");
    expect(results.some((place) => place.id === "futian-checkpoint")).toBe(true);
    expect(results.some((place) => place.side === "sz")).toBe(true);
  });

  it("地點表同時涵蓋香港與深圳", () => {
    expect(listPlaces("hk").length).toBeGreaterThan(0);
    expect(listPlaces("sz").length).toBeGreaterThan(0);
  });
});
