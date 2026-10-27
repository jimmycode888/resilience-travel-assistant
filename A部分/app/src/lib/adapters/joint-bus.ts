import { z } from "zod";
import { withDeadline } from "./deadline";
import { normalizeCitybusTimes, TransportTimeClient, type TransportTimeBoard } from "./transport-times";
import { parseArriveBy, toHkIso } from "@/lib/time";
export const KMB_690S = { stop: "5016E25156D72ADA", route: "690S", direction: "O", serviceType: 1, label: "明德邨 → 中環（九巴）" } as const;
const iso = z.string().refine((value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && parseArriveBy(value).ok);
const schema = z.object({ generated_timestamp: iso, data: z.array(z.object({ co: z.literal("KMB"), route: z.string(), dir: z.string(), service_type: z.number(), seq: z.number(), eta: iso.nullable(), dest_tc: z.string(), data_timestamp: iso })) });
export function normalizeKmb690s(raw: unknown, nowMs = Date.now()): TransportTimeBoard {
  const value = schema.parse(raw), p = KMB_690S;
  const updatedAt = value.generated_timestamp;
  const expires = Math.min(nowMs + 120000, Date.parse(updatedAt) + 120000);
  if (expires <= nowMs || Date.parse(updatedAt) > nowMs + 60000) throw new Error("九巴來源時間過期或超前");
  const rows = value.data.filter((row) => row.route === p.route && row.dir === p.direction && row.service_type === p.serviceType && row.seq === 1 && Date.parse(row.data_timestamp) >= nowMs - 120000 && Date.parse(row.data_timestamp) <= nowMs + 60000);
  const arrivals = rows.flatMap((row) => row.eta && Date.parse(row.eta) >= nowMs ? [{ at: row.eta, destination: row.dest_tc, platform: null }] : []).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { id: "KMB-690S-5016E25156D72ADA-O", label: p.label, sourceUrl: `https://data.etabus.gov.hk/v1/transport/kmb/eta/${p.stop}/${p.route}/${p.serviceType}`, updatedAt, collectedAt: toHkIso(nowMs), expiresAt: toHkIso(expires), quality: "live", state: arrivals.length ? "available" : "no_prediction", delayReported: null, arrivals, note: "官方已核對明德邨站與O方向；沒有ETA不是停駛。未確認全程行車時間，不能冒充現有R2。" };
}
export class Joint690sClient {
  private cached: TransportTimeBoard | null = null;
  private readonly citybus: TransportTimeClient;
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now, private readonly timeoutMs = 2500) { this.citybus = new TransportTimeClient(fetcher, now); }
  async kmb(): Promise<TransportTimeBoard> {
    const url = `https://data.etabus.gov.hk/v1/transport/kmb/eta/${KMB_690S.stop}/690S/1`;
    try {
      const result = await withDeadline(async (signal) => { const response = await this.fetcher(url, { signal, cache: "no-store" }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return normalizeKmb690s(await response.json(), this.now()); }, this.timeoutMs);
      this.cached = result; return result;
    } catch {
      if (this.cached && Date.parse(this.cached.expiresAt) > this.now()) return { ...this.cached, quality: "cached" };
      return { id: "KMB-690S", label: KMB_690S.label, sourceUrl: url, updatedAt: toHkIso(this.now()), collectedAt: toHkIso(this.now()), expiresAt: toHkIso(this.now() + 30000), quality: "fixture", state: "unavailable", delayReported: null, arrivals: [], note: "九巴來源失敗，固定無班次資料回退。" };
    }
  }
  async collect() { return Promise.all([this.citybus.citybus(), this.kmb()]); }
}
// Retained export makes the official Citybus normalizer available to consumers.
export { normalizeCitybusTimes };
