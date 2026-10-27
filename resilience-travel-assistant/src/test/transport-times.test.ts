import { describe, expect, it } from "vitest";
import { MTR_TIME_POINTS, normalizeCitybusTimes, normalizeMtrTimes, TransportTimeClient } from "@/lib/adapters/transport-times";
import { normalizeTrafficNews } from "@/lib/adapters/traffic-news";
import { resolveContextWithTier, SnapshotCache } from "@/lib/adapters";
import { getFixtureSnapshot } from "@/lib/fixtures/context";
const at = Date.parse("2026-10-07T09:30:00+08:00");
const rawMtr = { status: 1, message: "successful", isdelay: "N", data: { "TKL-HAH": { curr_time: "2026-10-07 09:30:00", DOWN: [
  { dest: "NOP", plat: "2", time: "2026-10-07 09:32:00", seq: "1", ttnt: "999", valid: "N" },
  { dest: "TIK", plat: "2", time: "2026-10-07 09:31:00", seq: "2" },
] } } };
const rawBus = { type: "ETA", generated_timestamp: "2026-10-07T09:30:00+08:00", data: [{ co: "CTB", route: "690S", stop: "002910", dir: "I", dest_tc: "中環（交易廣場）", eta: "2026-10-07T09:35:00+08:00", data_timestamp: "2026-10-07T09:30:00+08:00" }] };
function xml(status = "NEW", date = "2026-10-07T09:15:00", location = "東區海底隧道") { return `<list><message><ID>1</ID><INCIDENT_NUMBER>IN-1</INCIDENT_NUMBER><INCIDENT_STATUS_EN>${status}</INCIDENT_STATUS_EN><ANNOUNCEMENT_DATE>${date}</ANNOUNCEMENT_DATE><INCIDENT_HEADING_CN>道路事故</INCIDENT_HEADING_CN><LOCATION_CN>${location}</LOCATION_CN><CONTENT_CN>車輛故障</CONTENT_CN></message></list>`; }
describe("official stop arrival semantics", () => {
  it("uses documented time and destination; ignores dummy ttnt/valid", () => {
    const board = normalizeMtrTimes(rawMtr, MTR_TIME_POINTS[0], at);
    expect(board.arrivals).toHaveLength(1); expect(board.arrivals[0]?.at).toBe("2026-10-07T09:32:00+08:00");
    expect(board.state).toBe("available"); expect(board.delayReported).toBe(false);
  });
  it("MTR special arrangement is alert, not proven suspension", () => {
    expect(normalizeMtrTimes({ status: 0, message: "special arrangements" }, MTR_TIME_POINTS[0], at).state).toBe("alert");
  });
  it("absent or empty predictions are not normal service", () => {
    expect(normalizeMtrTimes({ status: 1, message: "success", data: { "TKL-HAH": { curr_time: "-" } } }, MTR_TIME_POINTS[0], at).state).toBe("unavailable");
    expect(normalizeCitybusTimes({ ...rawBus, data: [] }, at).state).toBe("no_prediction");
  });
  it("filters wrong bus direction, null ETA and past predictions", () => {
    expect(normalizeCitybusTimes(rawBus, at).arrivals).toHaveLength(1);
    for (const patch of [{ dir: "O" }, { eta: "" }, { eta: null }, { eta: "2026-10-07T09:29:00+08:00" }, { route: "690" }]) {
      expect(normalizeCitybusTimes({ ...rawBus, data: [{ ...rawBus.data[0], ...patch }] }, at).arrivals).toHaveLength(0);
    }
  });
  it("rejects old/future timestamps and malformed responses", () => {
    expect(() => normalizeMtrTimes(rawMtr, MTR_TIME_POINTS[0], at + 180000)).toThrow();
    expect(() => normalizeCitybusTimes(rawBus, at - 180000)).toThrow();
    expect(() => normalizeCitybusTimes({ ...rawBus, generated_timestamp: "2026-10-07T09:30:00" }, at)).toThrow();
  });
  it("30s read cache, expired source fallback never invents a bus", async () => {
    let time = at, calls = 0, fail = false;
    const client = new TransportTimeClient(async () => { calls++; if (fail) throw new Error("offline"); return new Response(JSON.stringify(rawBus)); }, () => time);
    expect((await client.citybus()).quality).toBe("live");
    expect((await client.citybus()).quality).toBe("cached"); expect(calls).toBe(1);
    time += 40000; fail = true; expect((await client.citybus()).quality).toBe("cached");
    time += 100000; const result = await client.citybus(); expect(result.quality).toBe("fixture"); expect(result.arrivals).toEqual([]); expect(result.state).toBe("unavailable");
  });
  it("503 and malformed JSON fall back to explicit no data", async () => {
    for (const response of [new Response("offline", { status: 503 }), new Response("broken json")]) {
      const result = await new TransportTimeClient(async () => response, () => at).citybus();
      expect(result.quality).toBe("fixture"); expect(result.arrivals).toEqual([]);
    }
  });
});
describe("TD bulletin normalization", () => {
  it("normalizes local HK announcement time, preserves fact/source caveat", () => {
    const incident = normalizeTrafficNews(xml())[0];
    expect(incident?.since).toBe("2026-10-07T09:15:00+08:00");
    expect(incident?.detail).toContain("不等於事件首次發生時間");
  });
  it("filters closed/unrelated incidents and accepts empty list", () => {
    expect(normalizeTrafficNews(xml("CLOSED"))).toEqual([]);
    expect(normalizeTrafficNews(xml("NEW", "2026-10-07T09:15:00", "屯門公路"))).toEqual([]);
    expect(normalizeTrafficNews("<list/>" )).toEqual([]);
  });
  it("rejects malformed XML, invalid dates and entity declarations", () => {
    for (const value of ["<list>", xml("NEW", "2026-02-30T09:00:00"), '<!DOCTYPE list [<!ENTITY x SYSTEM "file:///etc/passwd">]><list/>']) expect(() => normalizeTrafficNews(value)).toThrow();
  });
});
describe("partial provider failure", () => {
  it("preserves weather when another source ignores timeout; reports failure", async () => {
    const result = await resolveContextWithTier({ scenario: "live", timeoutMs: 10, now: () => at, cache: new SnapshotCache(), providers: [
      { id: "hko-weather", provides: ["weather"], fetch: async () => ({ weather: { ...getFixtureSnapshot("normal").weather, updatedAt: "2026-10-07T09:30:00+08:00" } }) },
      { id: "td-special-traffic-news", provides: ["incidents"], fetch: async () => new Promise(() => {}) },
    ] });
    expect(result.tier).toBe("live"); expect(result.resolution.notices.join()).toContain("td-special-traffic-news：逾時");
    expect(result.resolution.snapshot.sources.some((s) => s.id === "td-special-traffic-news")).toBe(false);
  });
});
