/**
 * OSRM 路線供應商（成員 A 維護）——真實路網讀取，**不需要任何金鑰**。
 *
 * 為什麼選 OSRM：本專案的底線是「不填金鑰也能跑」。OSRM 的公開示範伺服器
 * 提供 `walking` 與 `driving`（道路）路網，正好用來取得真實折線座標；
 * 商業地圖的逐步導航則交給深鏈跳轉（`lib/nav`），不在此處接 SDK。
 *
 * ⚠️ 誠實揭露的限制（必須寫進 notice，讓使用者看到）：
 *   1. OSRM 只有路網，**沒有公共交通班次**。因此本供應商只能產生
 *      「步行」或「道路（巴士／跨境巴士）」的單一路段路線，
 *      不能用來產生地鐵行程。地鐵行程由 `providers/fixture.ts` 或成員 B 的
 *      官方資料供應商提供。
 *   2. 公開示範伺服器不保證可用性；逾時或失敗一律由 adapter 走三退路。
 */
import { findPlace } from "@/lib/geo/places";
import { toHkIso } from "@/lib/time";
import type { LonLat } from "@/lib/types/journey";
import type { RawJourney, RawRoute, RouteProvider, RouteQuery } from "@/lib/types/route";

export const OSRM_DEFAULT_BASE_URL = "https://router.project-osrm.org";
export const OSRM_DEFAULT_TIMEOUT_MS = 4000;

export type OsrmProfile = "walking" | "driving";

export interface OsrmProviderOptions {
  baseUrl?: string;
  /** 只用來取路網座標：walking 對應步行段，driving 對應巴士／跨境巴士段。 */
  profile?: OsrmProfile;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** 注入時鐘，讓測試與快照可重現。 */
  now?: () => number;
}

interface OsrmRoute {
  duration: number;
  distance: number;
  geometry?: { coordinates?: unknown };
}

interface OsrmResponse {
  code?: string;
  routes?: OsrmRoute[];
}

function isLonLat(value: unknown): value is LonLat {
  return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number");
}

/** 把 OSRM 的 coordinates 收斂成合法折線。 */
export function readOsrmGeometry(raw: unknown): LonLat[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isLonLat);
}

export function createOsrmProvider(options: OsrmProviderOptions = {}): RouteProvider {
  const baseUrl = (options.baseUrl ?? OSRM_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const profile = options.profile ?? "walking";
  const timeoutMs = options.timeoutMs ?? OSRM_DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  return {
    id: "osrm",
    provides: "journey",

    async fetch(query: RouteQuery, signal: AbortSignal): Promise<RawRoute[] | null> {
      const origin = findPlace(query.origin);
      const destination = findPlace(query.destination);
      // 沒有座標就無從查路網；回傳 null 讓 adapter 走下一層。
      if (!origin || !destination) return null;

      const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
      const url =
        `${baseUrl}/route/v1/${profile}/${coordinates}` +
        "?overview=full&geometries=geojson&steps=false&alternatives=false";

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onOuterAbort = () => controller.abort();
      signal.addEventListener("abort", onOuterAbort, { once: true });

      try {
        const response = await fetchImpl(url, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`OSRM 回應 ${response.status}`);
        }
        const payload = (await response.json()) as OsrmResponse;
        if (payload.code !== "Ok" || !payload.routes?.length) return null;

        const route = payload.routes[0];
        if (!route) return null;

        const geometry = readOsrmGeometry(route.geometry?.coordinates);
        const fetchedAt = toHkIso(now());
        const durationMinutes = Math.max(1, Math.round(route.duration / 60));

        const journey: RawJourney = {
          id: `osrm-${profile}-${origin.id}-${destination.id}`,
          label: profile === "walking" ? "步行（真實路網）" : "道路路線（真實路網）",
          departAt: query.departAt,
          steps: [
            {
              mode: profile,
              line: null,
              from: { name: origin.name, lat: origin.lat, lon: origin.lon },
              to: { name: destination.name, lat: destination.lat, lon: destination.lon },
              durationMinutes,
              geometry,
            },
          ],
        };

        return [
          {
            provider: "osrm",
            quality: "live",
            journey,
            fetchedAt,
            notices: [
              "本路段為真實路網折線（OSRM，無需金鑰），但不含公共交通班次時間。",
              "道路路段的時間為路網行車估計，不含候車與上落客時間。",
            ],
          },
        ];
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onOuterAbort);
      }
    },
  };
}
