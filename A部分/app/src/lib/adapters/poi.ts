import { z } from "zod";
import { withDeadline } from "./deadline";
import { toHkIso } from "@/lib/time";
export interface PoiCandidate { name: string; lat: number; lon: number; sourceUrl: string; updatedAt: string; quality: "live" | "cached" | "fixture"; note: string }
const numeric = z.coerce.number().finite();
const schema = z.object({ SuggestedAddress: z.array(z.object({ Address: z.object({ PremisesAddress: z.object({ ChiPremisesAddress: z.object({ BuildingName: z.string().optional(), ChiEstate: z.object({ EstateName: z.string().optional() }).optional() }), GeospatialInformation: z.object({ Latitude: numeric.min(-90).max(90), Longitude: numeric.min(-180).max(180) }) }) }) })).optional() });
export function normalizePoi(raw: unknown, url: string, at: string): PoiCandidate[] {
  return (schema.parse(raw).SuggestedAddress ?? []).map((row) => {
    const p = row.Address.PremisesAddress;
    return { name: p.ChiPremisesAddress.BuildingName ?? p.ChiPremisesAddress.ChiEstate?.EstateName ?? "未提供名稱", lat: p.GeospatialInformation.Latitude, lon: p.GeospatialInformation.Longitude, sourceUrl: url, updatedAt: at, quality: "live" as const, note: "官方地址代表點；搜尋相似項不代表目的地或出口已核實。" };
  });
}
export class PoiClient {
  private readonly cache = new Map<string, { rows: PoiCandidate[]; expiresAt: number }>();
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now, private readonly timeoutMs = 2500) {}
  async search(query: string): Promise<{ candidates: PoiCandidate[]; quality: "live" | "cached" | "fixture"; notice: string }> {
    const text = query.trim();
    if (!text || text.length > 120) return { candidates: [], quality: "fixture", notice: "查詢文字無效。" };
    const url = `https://www.als.gov.hk/lookup?q=${encodeURIComponent(text)}&n=10&b=1`;
    try {
      const rows = await withDeadline(async (signal) => {
        const response = await this.fetcher(url, { signal, headers: { Accept: "application/json" }, cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return normalizePoi(await response.json(), url, toHkIso(this.now()));
      }, this.timeoutMs);
      this.cache.set(text, { rows, expiresAt: this.now() + 3600000 });
      if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value!);
      return { candidates: rows, quality: "live", notice: rows.length ? "請核對候選名稱，地址代表點不是已核實入口。" : "官方沒有匹配地址，不自行編造地點。" };
    } catch {
      const cached = this.cache.get(text);
      return cached && cached.expiresAt > this.now() ? { candidates: cached.rows.map((row) => ({ ...row, quality: "cached" })), quality: "cached", notice: "地址來源失敗，使用一小時內快取。" } : { candidates: [], quality: "fixture", notice: "地址來源不可用，固定空資料回退；保留既有預設地点。" };
    }
  }
}
