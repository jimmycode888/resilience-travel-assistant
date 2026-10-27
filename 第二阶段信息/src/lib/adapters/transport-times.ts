import { z } from "zod";
import { parseArriveBy, toHkIso } from "@/lib/time";

export const MTR_TIME_POINTS = [
  { id: "TKL-HAH", line: "TKL", station: "HAH", destination: "NOP", label: "坑口 → 北角" },
  { id: "ISL-NOP", line: "ISL", station: "NOP", destination: "KET", label: "北角 → 堅尼地城（途經中環）" },
  { id: "ISL-QUB", line: "ISL", station: "QUB", destination: "KET", label: "鰂魚涌 → 堅尼地城（途經中環）" },
] as const;
export const BUS_TIME_POINT = { id: "CTB-690S-002910-I", company: "CTB", route: "690S", stop: "002910", direction: "I", label: "明德邨（寶寧路）→ 中環（交易廣場）" } as const;
export interface StopArrival {
  at: string;
  destination: string;
  platform: string | null;
}
/** B internal supplement. ETA is at this stop, never whole-trip duration or delay. */
export interface TransportTimeBoard {
  id: string;
  label: string;
  sourceUrl: string;
  updatedAt: string;
  collectedAt: string;
  expiresAt: string;
  quality: "live" | "cached" | "fixture";
  state: "available" | "no_prediction" | "alert" | "unavailable";
  delayReported: boolean | null;
  arrivals: StopArrival[];
  note: string;
}
const iso = z.string().refine((v) => /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && parseArriveBy(v).ok);
export function mtrIso(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) throw new Error("Invalid MTR local timestamp");
  const value = `${raw.replace(" ", "T")}+08:00`;
  iso.parse(value);
  return value;
}
const train = z.object({ dest: z.string(), time: z.string(), plat: z.union([z.string(), z.number()]), seq: z.union([z.string(), z.number()]) });
const mtrSchema = z.object({ status: z.union([z.literal(0), z.literal(1)]), message: z.string(), isdelay: z.enum(["Y", "N"]).optional(), curr_time: z.string().optional(), data: z.record(z.object({ curr_time: z.string(), DOWN: z.array(train).optional() })).optional() });
function boardBase(id: string, label: string, sourceUrl: string, updatedAt: string, nowMs: number): TransportTimeBoard {
  return { id, label, sourceUrl, updatedAt, collectedAt: toHkIso(nowMs), expiresAt: toHkIso(Math.min(nowMs + 120000, Date.parse(updatedAt) + 120000)), quality: "live", state: "no_prediction", delayReported: null, arrivals: [], note: "抵站預測非全程行車時間；不代表班距、服務正常或延誤分鐘數。" };
}
export function normalizeMtrTimes(raw: unknown, point: typeof MTR_TIME_POINTS[number], nowMs = Date.now()): TransportTimeBoard {
  const data = mtrSchema.parse(raw);
  const url = `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${point.line}&sta=${point.station}&lang=TC`;
  if (data.status === 0) return { ...boardBase(point.id, point.label, url, toHkIso(nowMs), nowMs), state: "alert", note: data.message + "；API alert 不等於確認全線停駛。" };
  const station = data.data?.[point.id];
  if (!station || station.curr_time === "-") return { ...boardBase(point.id, point.label, url, toHkIso(nowMs), nowMs), state: "unavailable", note: "上游缺少車站時間／資料，不推論停駛。" };
  const board = boardBase(point.id, point.label, url, mtrIso(station.curr_time), nowMs);
  if (Date.parse(board.expiresAt) <= nowMs || Date.parse(board.updatedAt) > nowMs + 60000) throw new Error("MTR timestamp stale or future");
  board.arrivals = (station.DOWN ?? []).filter((t) => t.dest === point.destination).map((t) => ({ at: mtrIso(t.time), destination: t.dest, platform: String(t.plat) })).filter((t) => Date.parse(t.at) >= nowMs && Date.parse(t.at) <= nowMs + 7200000).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  board.delayReported = data.isdelay ? data.isdelay === "Y" : null;
  board.state = board.arrivals.length ? "available" : "no_prediction";
  return board;
}
const busSchema = z.object({ type: z.literal("ETA"), generated_timestamp: iso, data: z.array(z.object({ co: z.string(), route: z.string(), dir: z.enum(["I", "O"]), stop: z.string(), eta: z.string().nullable(), dest_tc: z.string(), rmk_tc: z.string().optional(), data_timestamp: iso })) });
export function normalizeCitybusTimes(raw: unknown, nowMs = Date.now()): TransportTimeBoard {
  const data = busSchema.parse(raw);
  const p = BUS_TIME_POINT;
  const board = boardBase(p.id, p.label, `https://rt.data.gov.hk/v2/transport/citybus/eta/${p.company}/${p.stop}/${p.route}`, data.generated_timestamp, nowMs);
  if (Date.parse(board.expiresAt) <= nowMs || Date.parse(board.updatedAt) > nowMs + 60000) throw new Error("Citybus timestamp stale or future");
  const rows = data.data.filter((r) => r.co === p.company && r.route === p.route && r.stop === p.stop && r.dir === p.direction);
  board.arrivals = rows.filter((r) => r.eta && Date.parse(r.data_timestamp) >= nowMs - 120000 && Date.parse(r.data_timestamp) <= nowMs + 60000).map((r) => ({ at: iso.parse(r.eta), destination: r.dest_tc, platform: null })).filter((r) => Date.parse(r.at) >= nowMs && Date.parse(r.at) <= nowMs + 7200000).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  board.state = board.arrivals.length ? "available" : "no_prediction";
  board.note += "只涵蓋城巴班次；九巴時段、非服務時間或空 ETA 皆不可推論停駛。690S 並非現有 R2 起站，待 A 確認。" + rows.map((r) => r.rmk_tc ?? "").filter(Boolean).join("；");
  return board;
}

export class TransportTimeClient {
  private readonly cache = new Map<string, TransportTimeBoard>();
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now) {}
  private async read(id: string, label: string, url: string, normalize: (raw: unknown, nowMs: number) => TransportTimeBoard, signal?: AbortSignal): Promise<TransportTimeBoard> {
    const at = this.now();
    const cached = this.cache.get(id);
    const fallback = (note: string): TransportTimeBoard => cached && Date.parse(cached.expiresAt) > this.now()
      ? { ...cached, quality: "cached", note: `${cached.note}；${note}` }
      : { ...boardBase(id, label, url, toHkIso(this.now()), this.now()), quality: "fixture", state: "unavailable", note: `${note}；固定無資料回退（無虛構班次）。` };
    if (cached && at - Date.parse(cached.collectedAt) < 30000 && Date.parse(cached.expiresAt) > at) return { ...cached, quality: "cached" };
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const task = (async () => {
        const response = await this.fetcher(url, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return normalize(await response.json(), this.now());
      })();
      const result = await Promise.race([task, new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, 2500); })]);
      this.cache.set(id, result);
      return result;
    } catch (error) { return fallback(error instanceof Error ? error.message : "資料不可用"); }
    finally { if (timer) clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  }
  mtr(point: typeof MTR_TIME_POINTS[number], signal?: AbortSignal) {
    const url = `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${point.line}&sta=${point.station}&lang=TC`;
    return this.read(point.id, point.label, url, (raw, at) => normalizeMtrTimes(raw, point, at), signal);
  }
  citybus(signal?: AbortSignal) {
    const p = BUS_TIME_POINT;
    return this.read(p.id, p.label, `https://rt.data.gov.hk/v2/transport/citybus/eta/${p.company}/${p.stop}/${p.route}`, normalizeCitybusTimes, signal);
  }
  async collect(signal?: AbortSignal) { return Promise.all([...MTR_TIME_POINTS.map((p) => this.mtr(p, signal)), this.citybus(signal)]); }
}
export const transportTimeClient = new TransportTimeClient();
