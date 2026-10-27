import { describe, it, expect, vi } from "vitest";
import { Joint690sClient, normalizeKmb690s } from "@/lib/adapters/joint-bus";
import { SourceClient } from "@/lib/adapters/source-client";
import { withDeadline } from "@/lib/adapters/deadline";
import { createRouteDataResolver } from "@/lib/adapters/team-data";
import { PortConditionClient, collectPortObservations, estimateBorderQueue } from "@/lib/adapters/port-conditions";
import { holidayKind } from "@/lib/adapters/holidays";
import { PoiClient, normalizePoi } from "@/lib/adapters/poi";
import type { LiveDataProvider } from "@/lib/adapters/types";
import type { CandidateRoute } from "@/lib/types/route";
import { createFixtureProvider } from "@/lib/route/providers/fixture";
import { parseRawJourney } from "@/lib/route/parse";
const at = "2026-10-14T08:00:00+08:00", start = Date.parse(at);
const request = { origin: "central-exchange-square", destination: "futian-station-sz", departAt: at, mode: "balanced" as const };
const weather = (stamp: string) => ({ weather: { condition: "clear" as const, warning: null, updatedAt: stamp, rainfallMmPerHour: null, temperatureC: 25, note: null } });
const makeRoute = async () => {
  const raw = (await createFixtureProvider().fetch(request, new AbortController().signal))![0]!;
  const { journey } = parseRawJourney(raw.journey);
  return { id: raw.journey.id, label: raw.journey.label, quality: raw.quality, provider: raw.provider, journey } satisfies CandidateRoute;
};
const offline = () => new PortConditionClient({ fetcher: async () => { throw new Error("offline"); }, now: () => start, timeoutMs: 10 });
describe("B source and resolver fixes", () => {
  it("hard deadline settles even when upstream ignores cancellation", async () => { await expect(withDeadline(() => new Promise(() => {}), 10)).rejects.toThrow("逾時"); });
  it("already aborted requests terminate", async () => { const c = new AbortController(); c.abort(); await expect(withDeadline(() => new Promise(() => {}), 100, c.signal)).rejects.toThrow("取消"); });
  it("weather live → cached → expired fixture retains original timestamp", async () => {
    let time = start, fail = false;
    const provider: LiveDataProvider = { id: "weather", provides: ["weather"], fetch: async () => { if (fail) throw new Error("offline"); return weather(at); } };
    const client = new SourceClient(() => time, 10);
    expect((await client.read(provider, "weather", "https://example.test")).quality).toBe("live");
    fail = true; time += 60000;
    const cached = await client.read(provider, "weather", "https://example.test"); expect(cached.quality).toBe("cached"); expect(cached.updatedAt).toBe(start);
    time += 600000; expect((await client.read(provider, "weather", "https://example.test")).quality).toBe("fixture");
  });
  it("TD empty successful feed uses collection time, not journey departure", async () => {
    const read = await new SourceClient(() => start).read({ id: "td", provides: ["incidents"], fetch: async () => ({ incidents: [] }) }, "incidents", "https://example.test");
    expect(read.quality).toBe("live"); expect(read.updatedAt).toBe(start);
  });
  it("repeated departure refreshes weather after 30-second reuse", async () => {
    let time = start;
    const fetch = vi.fn(async () => weather(new Date(time).toISOString()));
    const resolve = createRouteDataResolver({ env: { TEAM_LIVE_DATA_ENABLED: "1" }, now: () => time, client: offline(), weatherProvider: { id: "weather", provides: ["weather"], fetch }, trafficProvider: null });
    const route = await makeRoute(); await resolve(route, request); time += 300000; await resolve(route, request); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("hanging weather degrades while route response still completes", async () => {
    const resolve = createRouteDataResolver({ env: { TEAM_LIVE_DATA_ENABLED: "1" }, now: () => start, client: offline(), timeoutMs: 10, weatherProvider: { id: "hang", provides: ["weather"], fetch: () => new Promise(() => {}) }, trafficProvider: null });
    const result = await resolve(await makeRoute(), request); expect(result?.quality).toBe("fixture"); expect(result?.source).toContain("逾時");
  });
  it("future date does not use current weather as a forecast", async () => {
    const resolve = createRouteDataResolver({ env: { TEAM_LIVE_DATA_ENABLED: "1" }, now: () => start - 86400000, client: offline(), weatherProvider: { id: "w", provides: ["weather"], fetch: async () => weather(new Date(start - 86400000).toISOString()) }, trafficProvider: null });
    const result = await resolve(await makeRoute(), request); expect(result?.quality).toBe("fixture"); expect(result?.value.weather).toBeNull(); expect(result?.confidence).toBe("low");
  });
  it("port reader rejects stale source clock rather than restamping live", async () => {
    const rows = await collectPortObservations({ now: () => start, portIds: ["lo-wu"], fetcher: async () => new Response(JSON.stringify({ status: 1, data: { "EAL-LOW": { curr_time: "2026-10-13 08:00:00", DOWN: [] } } })) });
    expect(rows[0]?.quality).toBe("fixture");
  });
  it("port reader hard deadline handles a fetch that ignores abort", async () => {
    const rows = await collectPortObservations({ now: () => start, portIds: ["lo-wu"], timeoutMs: 10, fetcher: () => new Promise(() => {}) }); expect(rows[0]?.quality).toBe("fixture");
  });
  it("official holiday calendar affects weekday holiday estimate", () => {
    expect(holidayKind("2026-10-01T08:00:00+08:00")).toBe("holiday"); expect(holidayKind("2030-10-01T08:00:00+08:00")).toBe("unknown");
    const holiday = estimateBorderQueue({ portId: "lo-wu", at: "2026-10-01T08:00:00+08:00" }); expect(holiday.basis.join()).toContain("公眾假期");
  });
});
describe("official address client", () => {
  it("empty and malformed responses do not invent coordinates", () => { expect(normalizePoi({ SuggestedAddress: [] }, "url", at)).toEqual([]); expect(() => normalizePoi({ SuggestedAddress: [{}] }, "url", at)).toThrow(); });
  it("HTTP errors and ignoring-abort fetch have fixed no-data fallback", async () => {
    for (const fetcher of [async () => new Response("error", { status: 503 }), () => new Promise<Response>(() => {})]) expect((await new PoiClient(fetcher, () => start, 10).search("医院")).quality).toBe("fixture");
  });
});


describe("KMB joint operation data", () => {
  const raw = { generated_timestamp: at, data: [
    { co: "KMB", route: "690S", dir: "O", service_type: 1, seq: 1, eta: "2026-10-14T08:10:00+08:00", dest_tc: "中環", data_timestamp: at },
    { co: "KMB", route: "690S", dir: "I", service_type: 1, seq: 1, eta: "2026-10-14T08:05:00+08:00", dest_tc: "坑口", data_timestamp: at },
  ] };
  it("filters opposite direction and preserves operator stop identity", () => { expect(normalizeKmb690s(raw, start).arrivals).toHaveLength(1); expect(normalizeKmb690s({ ...raw, data: [{ ...raw.data[0], eta: null }] }, start).state).toBe("no_prediction"); });
  it("live then offline uses cached KMB, expired data uses no-data fallback", async () => {
    let time = start, fail = false;
    const client = new Joint690sClient(async () => { if (fail) throw new Error("offline"); return new Response(JSON.stringify(raw)); }, () => time, 10);
    expect((await client.kmb()).quality).toBe("live"); fail = true; time += 30000; expect((await client.kmb()).quality).toBe("cached"); time += 120000; expect((await client.kmb()).quality).toBe("fixture");
  });
});


describe("source freshness regressions", () => {
  it("port cache lifetime is bounded by source time, not retrieval time", async () => {
    let time = start, fail = false;
    const client = new PortConditionClient({ now: () => time, fetcher: async () => {
      if (fail) throw new Error("offline");
      return new Response(JSON.stringify({ status: 1, data: { "EAL-LOW": { curr_time: "2026-10-14 07:59:00", DOWN: [{ dest: "ADM", time: "2026-10-14 08:05:00" }, { dest: "ADM", time: "2026-10-14 08:15:00" }] } } }));
    } });
    expect((await client.resolve({ at, portIds: ["lo-wu"] })).quality).toBe("live");
    time += 65000; fail = true;
    expect((await client.resolve({ at, portIds: ["lo-wu"] })).quality).toBe("fixture");
  });
  it("POI cached results expire without renewing their verification time", async () => {
    let time = start, fail = false;
    const client = new PoiClient(async () => {
      if (fail) throw new Error("offline");
      return new Response(JSON.stringify({ SuggestedAddress: [{ Address: { PremisesAddress: { ChiPremisesAddress: { BuildingName: "港鐵上水站" }, GeospatialInformation: { Latitude: "22.50149", Longitude: "114.12779" } } } }] }));
    }, () => time);
    expect((await client.search("上水站")).quality).toBe("live");
    fail = true; time += 1000; const cached = await client.search("上水站"); expect(cached.quality).toBe("cached"); expect(cached.candidates[0]?.updatedAt).toContain("08:00:00");
    time += 3600000; expect((await client.search("上水站")).quality).toBe("fixture");
  });
});
