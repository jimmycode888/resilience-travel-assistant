import { withDeadline } from "./deadline";
import { validateLivePayload } from "./validation";
import type { LiveDataPayload, LiveDataProvider } from "./types";
import type { DataQuality } from "@/lib/types";

export interface SourceRead {
  payload: LiveDataPayload | null;
  quality: DataQuality;
  updatedAt: number;
  expiresAt: number;
  sourceUrl: string | null;
  notice: string;
}
export class SourceClient {
  private readonly cache = new Map<string, SourceRead>();
  constructor(private readonly now: () => number = Date.now, private readonly timeoutMs = 2500) {}
  async read(provider: LiveDataProvider | null, type: "weather" | "incidents", sourceUrl: string | null): Promise<SourceRead> {
    const at = this.now();
    const empty = (notice: string): SourceRead => ({ payload: null, quality: "fixture", updatedAt: at, expiresAt: at + 30000, sourceUrl, notice });
    if (!provider) return empty(`${type} 未啟用，保留未知／固定無資料退路。`);
    const key = `${provider.id}|${sourceUrl}`;
    const cached = this.cache.get(key);
    try {
      const payload = await withDeadline((signal) => provider.fetch(signal), this.timeoutMs);
      if (!payload) throw new Error("來源回傳空資料");
      const value = validateLivePayload(payload);
      if (type === "weather" && !value.weather) throw new Error("缺少天氣觀測");
      if (type === "incidents" && !value.incidents) throw new Error("缺少公告資料");
      // TD empty feed has no last-update timestamp: this is explicitly retrieval time.
      const updatedAt = type === "weather" ? Date.parse(value.weather!.updatedAt) : this.now();
      const expiresAt = Math.min(this.now() + (type === "weather" ? 600000 : 120000), updatedAt + (type === "weather" ? 3600000 : 120000));
      if (!Number.isFinite(updatedAt) || updatedAt > this.now() + 60000 || expiresAt <= this.now()) throw new Error("來源時間過期或超前");
      const result: SourceRead = { payload: value, quality: "live", updatedAt, expiresAt, sourceUrl, notice: type === "incidents" ? "交通來源時間是本次擷取時刻；事件公告時刻另列，不等於發生時刻。" : "天氣更新時間採官方報告時間。" };
      this.cache.set(key, result);
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "來源不可用";
      if (cached && cached.expiresAt > this.now()) return { ...cached, quality: "cached", notice: `${provider.id} ${reason}，使用仍有效快取（不延長效期）。` };
      this.cache.delete(key);
      return empty(`${provider.id} ${reason}，使用固定無資料退路，沒有編造正常狀態。`);
    }
  }
}
