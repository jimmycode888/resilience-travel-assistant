import { describe, expect, it, vi, afterEach } from "vitest";
import { normalizeHko } from "@/lib/adapters/hko";
import { createHkoWeatherProvider } from "@/lib/adapters/live-providers";
import { resolveContextWithTier, SnapshotCache } from "@/lib/adapters";
const updatedAt = "2026-10-06T22:00:00+08:00";
const now = () => Date.parse(updatedAt);
const report = { updateTime: updatedAt, icon: [76], temperature: { data: [{ place: "將軍澳", value: 24, unit: "C" }] } };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("B official weather and fallback", () => {
  it("maps night cloud, station temperature and absent point rain honestly", () => {
    expect(normalizeHko(report, {}, now())).toMatchObject({ condition: "cloudy", temperatureC: 24, rainfallMmPerHour: null, warning: null });
  });
  it("maps black rain; cancelled and expired warnings are not active", () => {
    const w = { name: "Rainstorm", code: "WRAINB", actionCode: "ISSUE", updateTime: updatedAt };
    expect(normalizeHko(report, { WRAIN: w }, now()).warning).toBe("黑色暴雨警告信號");
    expect(normalizeHko(report, { WRAIN: { ...w, actionCode: "CANCEL" } }, now()).warning).toBeNull();
    expect(normalizeHko(report, { WRAIN: { ...w, expireTime: updatedAt } }, now()).warning).toBeNull();
  });
  it("rejects broken reports and invalid warning formats", () => {
    for (const raw of [{}, { ...report, updateTime: "bad" }, { ...report, temperature: { data: [{ place: "將軍澳", value: 900, unit: "C" }] } }]) expect(() => normalizeHko(raw, {})).toThrow();
    expect(() => normalizeHko(report, [])).toThrow();
  });
  it("handles official HTTP failure", async () => {
    vi.stubEnv("HKO_OPEN_DATA_BASE_URL", "https://data.weather.gov.hk/weatherAPI/opendata/weather.php");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    await expect(createHkoWeatherProvider()!.fetch(new AbortController().signal)).rejects.toThrow("503");
  });
  it("forces timeout even if provider ignores abort", async () => {
    const result = await resolveContextWithTier({ scenario: "live", timeoutMs: 10, providers: [{ id: "hang", provides: ["weather"], fetch: () => new Promise(() => {}) }], cache: new SnapshotCache() });
    expect(result.tier).toBe("fixture");
  });
  it("weather-only live uses unknown routes and cached quality is consistent", async () => {
    const cache = new SnapshotCache();
    const result = await resolveContextWithTier({ scenario: "live", now, cache, providers: [{ id: "hko-weather", provides: ["weather"], fetch: async () => ({ weather: normalizeHko(report, {}, now()) }) }] });
    expect(result.resolution.snapshot.routes.every((r) => r.status === "unknown")).toBe(true);
    expect(result.resolution.snapshot.sources.some((s) => s.quality === "fixture")).toBe(true);
    const fallback = await resolveContextWithTier({ scenario: "live", now, cache, providers: [{ id: "fail", provides: ["weather"], fetch: async () => { throw new Error("offline"); } }] });
    expect(fallback.resolution.snapshot.quality).toBe("cached");
    expect(fallback.resolution.snapshot.sources.some((s) => s.quality === "live")).toBe(false);
  });
  it("invalid payload cannot enter cache", async () => {
    const cache = new SnapshotCache();
    const result = await resolveContextWithTier({ scenario: "live", now, cache, providers: [{ id: "bad", provides: ["weather"], fetch: async () => ({ weather: { ...normalizeHko(report, {}), rainfallMmPerHour: -1 } }) }] });
    expect(result.tier).toBe("fixture"); expect(cache.size).toBe(0);
  });
});
