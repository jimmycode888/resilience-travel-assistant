/**
 * 瀏覽器定位與降級處理（成員 D 的前置模組，契約由成員 A 定義）。
 *
 * 遷移來源：CampusMapApp 的 `src/geolocate.js`（70 行），
 * 改寫為純函式＋TS＋可注入依賴，並補上原專案沒有的測試。
 *
 * 為什麼要獨立成模組：第二階段工作流要求地圖功能必須有**三條降級路徑**——
 * 無定位權限、無網路、無路線。這一份把第一條與第三條處理乾淨：
 *   - 權限被拒絕（PERMISSION_DENIED）
 *   - 位置不可用（POSITION_UNAVAILABLE）
 *   - 逾時（TIMEOUT）
 *   - 裝置不支援（UNSUPPORTED）
 * 每種都給出可顯示的訊息，且絕不讓呼叫端拿到 NaN 座標。
 *
 * 設計原則：本模組**不碰地圖、不碰 DOM**。它只回傳結果物件，
 * 由元件層決定要不要畫精度圈、要不要飛到位置。這樣才能在 Node 環境測試。
 */
import { distanceKm } from "./distance";

export type GeolocationErrorCode =
  | "UNSUPPORTED"
  | "PERMISSION_DENIED"
  | "POSITION_UNAVAILABLE"
  | "TIMEOUT";

export interface UserPosition {
  lat: number;
  lon: number;
  /** 定位精度半徑（公尺）。裝置沒提供時採保守預設值。 */
  accuracyM: number;
  /** 取得這個位置的時間（epoch 毫秒）。 */
  atMs: number;
}

export type LocateOutcome =
  | { ok: true; position: UserPosition }
  | { ok: false; code: GeolocationErrorCode; message: string };

/** 裝置未提供精度時採用的保守值（公尺），沿用原專案的 30。 */
export const DEFAULT_ACCURACY_M = 30;

const MESSAGES: Readonly<Record<GeolocationErrorCode, string>> = Object.freeze({
  UNSUPPORTED: "此裝置不支援定位，請自行選擇起點。",
  PERMISSION_DENIED: "定位權限被拒絕，請在系統設定中允許定位，或自行選擇起點。",
  POSITION_UNAVAILABLE: "無法取得位置（此裝置可能沒有定位來源），請自行選擇起點。",
  TIMEOUT: "定位逾時，請再試一次，或自行選擇起點。",
});

export function geolocationErrorMessage(code: GeolocationErrorCode): string {
  return MESSAGES[code];
}

/** 瀏覽器 GeolocationPositionError.code（1/2/3）→ 我們的錯誤碼。 */
export function mapBrowserErrorCode(code: number): GeolocationErrorCode {
  if (code === 1) return "PERMISSION_DENIED";
  if (code === 3) return "TIMEOUT";
  return "POSITION_UNAVAILABLE";
}

interface RawCoords {
  latitude?: unknown;
  longitude?: unknown;
  accuracy?: unknown;
}

/**
 * 驗證並正規化座標。
 *
 * 回傳 `null` 代表這個位置不可用——寧可降級，也不要讓 NaN 流進地圖或路線查詢。
 */
export function readPosition(coords: RawCoords, atMs: number): UserPosition | null {
  const lat = Number(coords.latitude);
  const lon = Number(coords.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const rawAccuracy = Number(coords.accuracy);
  const accuracyM = Number.isFinite(rawAccuracy) && rawAccuracy > 0 ? rawAccuracy : DEFAULT_ACCURACY_M;

  return { lat, lon, accuracyM, atMs };
}

export interface GeolocationLike {
  getCurrentPosition(
    success: (position: { coords: RawCoords }) => void,
    error: (error: { code: number }) => void,
    options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
  ): void;
}

export interface LocatorDeps {
  /** 注入定位實作（測試用）。未提供時取 `navigator.geolocation`。 */
  geolocation?: GeolocationLike | null;
  now?: () => number;
  /** 裝置層逾時（毫秒），同時作為我們的防禦性逾時。 */
  timeoutMs?: number;
  maximumAgeMs?: number;
  enableHighAccuracy?: boolean;
}

export interface LocatorOptions {
  /** 靜默模式：仍回傳結果，但呼叫端可選擇不顯示錯誤訊息。 */
  silent?: boolean;
}

export interface Locator {
  locate(options?: LocatorOptions): Promise<LocateOutcome>;
  /** 最近一次成功取得的位置；未取得過為 null。 */
  lastPosition(): UserPosition | null;
  /** 是否有定位正在進行中（供 UI 顯示載入狀態）。 */
  isLocating(): boolean;
}

export const DEFAULT_GEOLOCATION_TIMEOUT_MS = 12_000;
export const DEFAULT_MAXIMUM_AGE_MS = 30_000;

function resolveGeolocation(deps: LocatorDeps): GeolocationLike | null {
  if (deps.geolocation !== undefined) return deps.geolocation;
  // SSR 安全：Next.js 在伺服器端沒有 navigator。
  if (typeof navigator === "undefined") return null;
  const candidate = (navigator as Navigator & { geolocation?: GeolocationLike }).geolocation;
  return candidate ?? null;
}

/**
 * 建立定位器。
 *
 * 行為與原專案一致：**同一時間只允許一次定位**，重複呼叫會共用同一個 Promise，
 * 避免使用者連點造成多次系統對話框。
 */
export function createLocator(deps: LocatorDeps = {}): Locator {
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_GEOLOCATION_TIMEOUT_MS;
  const maximumAgeMs = deps.maximumAgeMs ?? DEFAULT_MAXIMUM_AGE_MS;
  const enableHighAccuracy = deps.enableHighAccuracy ?? true;
  const geolocation = resolveGeolocation(deps);

  let lastPositionValue: UserPosition | null = null;
  let inFlight: Promise<LocateOutcome> | null = null;

  function failure(code: GeolocationErrorCode): LocateOutcome {
    return { ok: false, code, message: geolocationErrorMessage(code) };
  }

  async function run(): Promise<LocateOutcome> {
    if (!geolocation) return failure("UNSUPPORTED");

    return new Promise<LocateOutcome>((resolve) => {
      let settled = false;

      const settle = (outcome: LocateOutcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(outcome);
      };

      // 裝置層逾時已交給瀏覽器；這裡再加一層防禦，
      // 因為某些實作在無定位來源時可能永遠不回呼。
      const timer = setTimeout(() => settle(failure("TIMEOUT")), timeoutMs + 500);

      try {
        geolocation.getCurrentPosition(
          (position) => {
            const parsed = readPosition(position.coords ?? {}, now());
            if (!parsed) {
              settle(failure("POSITION_UNAVAILABLE"));
              return;
            }
            lastPositionValue = parsed;
            settle({ ok: true, position: parsed });
          },
          (error) => settle(failure(mapBrowserErrorCode(Number(error?.code)))),
          { enableHighAccuracy, timeout: timeoutMs, maximumAge: maximumAgeMs },
        );
      } catch {
        settle(failure("POSITION_UNAVAILABLE"));
      }
    });
  }

  return {
    locate(): Promise<LocateOutcome> {
      if (inFlight) return inFlight;
      inFlight = run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    lastPosition: () => lastPositionValue,
    isLocating: () => inFlight !== null,
  };
}

/** 兩點間距離（公尺），供「距離我多遠」顯示使用。 */
export function metersBetween(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): number {
  return Math.round(distanceKm(from.lat, from.lon, to.lat, to.lon) * 1000);
}
