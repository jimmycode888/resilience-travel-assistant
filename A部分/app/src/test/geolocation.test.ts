/**
 * 定位與降級路徑測試（遷移自 CampusMapApp 的 geolocate.js，原專案無測試）。
 *
 * 這一組測試守住第二階段工作流的硬要求：
 * 「無定位權限、無網路、無路線」三條降級路徑不能白屏。
 * 這裡覆蓋前兩條，且確認**絕不讓 NaN 座標流進地圖或路線查詢**。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ACCURACY_M,
  createLocator,
  geolocationErrorMessage,
  mapBrowserErrorCode,
  metersBetween,
  readPosition,
  type GeolocationLike,
} from "@/lib/geo/geolocation";

afterEach(() => {
  vi.useRealTimers();
});

function successGeo(lat: number, lon: number, accuracy?: number): GeolocationLike {
  return {
    getCurrentPosition: (onSuccess) =>
      onSuccess({ coords: { latitude: lat, longitude: lon, accuracy } }),
  };
}

function errorGeo(code: number): GeolocationLike {
  return { getCurrentPosition: (_success, onError) => onError({ code }) };
}

describe("座標正規化", () => {
  it("合法座標會被採用", () => {
    const position = readPosition({ latitude: 22.28, longitude: 114.15, accuracy: 12 }, 1000);
    expect(position).toEqual({ lat: 22.28, lon: 114.15, accuracyM: 12, atMs: 1000 });
  });

  it("缺少精度時使用保守預設值", () => {
    const position = readPosition({ latitude: 22.28, longitude: 114.15 }, 1000);
    expect(position?.accuracyM).toBe(DEFAULT_ACCURACY_M);
  });

  it("NaN 座標會被拒絕（不得流進地圖）", () => {
    expect(readPosition({ latitude: Number.NaN, longitude: 114.15 }, 0)).toBeNull();
    expect(readPosition({ latitude: 22.28, longitude: undefined }, 0)).toBeNull();
  });

  it("超出範圍的座標會被拒絕", () => {
    expect(readPosition({ latitude: 200, longitude: 114.15 }, 0)).toBeNull();
    expect(readPosition({ latitude: 22.28, longitude: 999 }, 0)).toBeNull();
  });
});

describe("錯誤碼對照", () => {
  it("瀏覽器錯誤碼 1/2/3 對應到我們的四種情況", () => {
    expect(mapBrowserErrorCode(1)).toBe("PERMISSION_DENIED");
    expect(mapBrowserErrorCode(2)).toBe("POSITION_UNAVAILABLE");
    expect(mapBrowserErrorCode(3)).toBe("TIMEOUT");
    expect(mapBrowserErrorCode(99)).toBe("POSITION_UNAVAILABLE");
  });

  it("每種錯誤都有可顯示的中文訊息", () => {
    expect(geolocationErrorMessage("PERMISSION_DENIED")).toContain("權限");
    expect(geolocationErrorMessage("UNSUPPORTED")).toContain("不支援");
    expect(geolocationErrorMessage("TIMEOUT")).toContain("逾時");
    expect(geolocationErrorMessage("POSITION_UNAVAILABLE")).toContain("無法取得位置");
  });

  it("每種降級訊息都引導使用者自行選擇起點", () => {
    expect(geolocationErrorMessage("PERMISSION_DENIED")).toContain("自行選擇起點");
    expect(geolocationErrorMessage("UNSUPPORTED")).toContain("自行選擇起點");
  });
});

describe("定位結果", () => {
  it("不支援定位時回報 UNSUPPORTED，而不是拋錯", async () => {
    const outcome = await createLocator({ geolocation: null }).locate();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("UNSUPPORTED");
  });

  it("成功時回傳座標與精度", async () => {
    const locator = createLocator({ geolocation: successGeo(22.28, 114.15, 8) });
    const outcome = await locator.locate();
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.position.lat).toBeCloseTo(22.28);
      expect(outcome.position.accuracyM).toBe(8);
    }
    expect(locator.lastPosition()?.lon).toBeCloseTo(114.15);
  });

  it("權限被拒絕時給出可顯示訊息", async () => {
    const outcome = await createLocator({ geolocation: errorGeo(1) }).locate();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("PERMISSION_DENIED");
      expect(outcome.message).toContain("權限");
    }
  });

  it("位置不可用與逾時各自回報", async () => {
    const unavailable = await createLocator({ geolocation: errorGeo(2) }).locate();
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) expect(unavailable.code).toBe("POSITION_UNAVAILABLE");

    const timeout = await createLocator({ geolocation: errorGeo(3) }).locate();
    expect(timeout.ok).toBe(false);
    if (!timeout.ok) expect(timeout.code).toBe("TIMEOUT");
  });

  it("裝置回傳無效座標時降級，不讓 NaN 通過", async () => {
    const geo: GeolocationLike = {
      getCurrentPosition: (onSuccess) =>
        onSuccess({ coords: { latitude: Number.NaN, longitude: Number.NaN } }),
    };
    const outcome = await createLocator({ geolocation: geo }).locate();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("POSITION_UNAVAILABLE");
  });

  it("裝置實作直接拋錯時也能降級", async () => {
    const geo: GeolocationLike = {
      getCurrentPosition: () => {
        throw new Error("裝置層錯誤");
      },
    };
    const outcome = await createLocator({ geolocation: geo }).locate();
    expect(outcome.ok).toBe(false);
  });
});

describe("併發與逾時保護", () => {
  it("同時多次呼叫只會觸發一次定位（避免連點造成多次系統對話框）", async () => {
    let calls = 0;
    const geo: GeolocationLike = {
      getCurrentPosition: (onSuccess) => {
        calls += 1;
        onSuccess({ coords: { latitude: 22.28, longitude: 114.15 } });
      },
    };
    const locator = createLocator({ geolocation: geo });
    const [first, second] = await Promise.all([locator.locate(), locator.locate()]);
    expect(calls).toBe(1);
    expect(first).toEqual(second);
  });

  it("裝置永遠不回呼時，防禦性逾時會結束等待", async () => {
    vi.useFakeTimers();
    const geo: GeolocationLike = { getCurrentPosition: () => {} };
    const locator = createLocator({ geolocation: geo, timeoutMs: 1000 });

    const pending = locator.locate();
    expect(locator.isLocating()).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    const outcome = await pending;

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("TIMEOUT");
    expect(locator.isLocating()).toBe(false);
  });

  it("逾時後可以重新定位（不會卡住）", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const geo: GeolocationLike = {
      getCurrentPosition: (onSuccess) => {
        calls += 1;
        if (calls > 1) onSuccess({ coords: { latitude: 22.28, longitude: 114.15 } });
      },
    };
    const locator = createLocator({ geolocation: geo, timeoutMs: 1000 });

    const first = locator.locate();
    await vi.advanceTimersByTimeAsync(2000);
    expect((await first).ok).toBe(false);

    const second = await locator.locate();
    expect(second.ok).toBe(true);
  });
});

describe("距離計算", () => {
  it("中環到金鐘約 1 公里內", () => {
    const meters = metersBetween({ lat: 22.282, lon: 114.158 }, { lat: 22.279, lon: 114.165 });
    expect(meters).toBeGreaterThan(300);
    expect(meters).toBeLessThan(1200);
  });

  it("跨境距離為數十公里量級", () => {
    const meters = metersBetween({ lat: 22.282, lon: 114.158 }, { lat: 22.539, lon: 114.057 });
    expect(meters).toBeGreaterThan(20_000);
  });
});
