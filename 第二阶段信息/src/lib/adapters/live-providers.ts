import type { LiveDataPayload, LiveDataProvider } from "./types";
import { normalizeTrafficNews } from "./traffic-news";
import { MTR_TIME_POINTS, transportTimeClient } from "./transport-times";
import { toHkIso } from "@/lib/time";
import { normalizeHko } from "./hko";

function readEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : null;
}

/** 香港天文台：天氣警告與降雨。 */
export function createHkoWeatherProvider(): LiveDataProvider | null {
  const baseUrl = readEnv("HKO_OPEN_DATA_BASE_URL");
  const warningUrl = readEnv("HKO_WEATHER_WARNING_URL");
  if (!baseUrl && !warningUrl) return null;

  return {
    id: "hko-weather",
    provides: ["weather"],
    async fetch(signal: AbortSignal): Promise<LiveDataPayload | null> {
      const endpoint = baseUrl ?? "https://data.weather.gov.hk/weatherAPI/opendata/weather.php";
      const reportUrl = new URL(endpoint);
      reportUrl.searchParams.set("dataType", "rhrread");
      reportUrl.searchParams.set("lang", "tc");
      const summaryUrl = new URL(warningUrl ?? endpoint);
      if (!warningUrl) {
        summaryUrl.searchParams.set("dataType", "warnsum");
        summaryUrl.searchParams.set("lang", "tc");
      }
      const read = async (url: URL) => {
        const response = await fetch(url, { signal, cache: "no-store" });
        if (!response.ok) throw new Error(`香港天文台回應 ${response.status}`);
        return response.json() as Promise<unknown>;
      };
      const [report, warnings] = await Promise.all([read(reportUrl), read(summaryUrl)]);
      return { weather: normalizeHko(report, warnings) };
    },
  };
}

/** 運輸署：特別交通消息。 */
export function createTransportDepartmentProvider(): LiveDataProvider | null {
  const url = readEnv("TD_SPECIAL_TRAFFIC_NEWS_URL");
  if (!url) return null;

  return {
    id: "td-special-traffic-news",
    provides: ["routes", "incidents"],
    async fetch(signal: AbortSignal): Promise<LiveDataPayload | null> {
      const response = await fetch(url, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`運輸署回應 ${response.status}`);
      }
      return { incidents: normalizeTrafficNews(await response.text()) };
    },
  };
}

/** 依據環境變數建立目前可用的實時來源清單（可能為空）。 */
export function createLiveProviders(): LiveDataProvider[] {
  return [createHkoWeatherProvider(), createTransportDepartmentProvider(), createMtrTimesProvider()].filter(
    (provider): provider is LiveDataProvider => provider !== null,
  );
}

export function liveProvidersConfigured(): boolean {
  return createLiveProviders().length > 0;
}

/** ETA observations enrich notes without replacing the frozen route-time model. */
export function createMtrTimesProvider(): LiveDataProvider | null {
  if (process.env.MTR_NEXT_TRAIN_ENABLED !== "1") return null;
  return {
    id: "mtr-next-train", provides: ["routes"],
    async fetch(signal) {
      const boards = await Promise.all(MTR_TIME_POINTS.map((p) => transportTimeClient.mtr(p, signal)));
      // cached/unavailable boards remain available to the standalone supplement,
      // but cannot enter a snapshot marked live.
      const live = boards.filter((b) => b.quality === "live");
      if (!live.length) return null;
      const note = (ids: string[]) => live.filter((b) => ids.includes(b.id)).map((b) => `${b.label}：${b.arrivals[0] ? "下一班抵站 " + b.arrivals[0].at : b.note}；${b.sourceUrl}`).join("；") || "未取得抵站預測";
      return { routes: [
        { routeId: "R1", status: "unknown", delayMinutes: 0, crowding: "unknown", note: note(["TKL-HAH", "ISL-NOP"]) + "；預測只適用現在，不能推算未來出發的接駁或全程延誤。", affectedSegments: [], updatedAt: live.reduce((min, b) => b.updatedAt < min ? b.updatedAt : min, live[0]!.updatedAt) },
        { routeId: "R2", status: "unknown", delayMinutes: 0, crowding: "unknown", note: "R2 真實起站與线路尚待確認；城巴 690S 候選數據獨立提供，不冒充現行 R2。", affectedSegments: [], updatedAt: toHkIso(Date.now()) },
        { routeId: "R3", status: "unknown", delayMinutes: 0, crowding: "unknown", note: note(["TKL-HAH", "ISL-QUB"]) + "；與 R1 共用將軍澳線，非獨立故障備援。", affectedSegments: [], updatedAt: live.reduce((min, b) => b.updatedAt < min ? b.updatedAt : min, live[0]!.updatedAt) },
      ] };
    },
  };
}
