/**
 * 香港時區時間工具。
 *
 * 工程規則：內部一律使用 ISO datetime；只在 UI 層轉成香港時區顯示。
 * 本模組不做任何「取現在時間」的動作 —— 所有函式都是輸入 → 輸出的純函式，
 * 這樣決策結果才會是可重現的。
 */

export const HK_TIME_ZONE = "Asia/Hong_Kong";
export const HK_OFFSET = "+08:00";

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const FULL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export interface ZonedParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  seconds: string; // HH:mm:ss
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string; // 週一 … 週日
}

const PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: HK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("zh-HK", {
  timeZone: HK_TIME_ZONE,
  weekday: "short",
});

const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"] as const;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** 把一個 epoch 毫秒轉成香港時區的日曆欄位。 */
export function zonedPartsFromEpoch(epochMs: number): ZonedParts {
  const parts = PARTS_FORMATTER.formatToParts(new Date(epochMs));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "00";

  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  const date = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  const weekdayIndex = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekdayLabel = WEEKDAYS[weekdayIndex] ?? WEEKDAY_FORMATTER.format(new Date(epochMs));

  return {
    date,
    time: `${pad(hour)}:${pad(minute)}`,
    seconds: `${pad(hour)}:${pad(minute)}:${pad(second)}`,
    year,
    month,
    day,
    hour,
    minute,
    weekday: weekdayLabel,
  };
}

/**
 * 解析使用者／前端傳來的到達時間。
 *
 * - `YYYY-MM-DDTHH:mm` 或 `YYYY-MM-DDTHH:mm:ss` → 以香港時區解讀。
 * - 帶 `Z` 或偏移量的完整 ISO 8601 → 轉換為香港時區。
 *
 * 會做日曆 round-trip 檢查，因此 `2026-02-30T09:00` 這類不存在的日期會被拒絕，
 * 而不是被 JavaScript 靜默地正規化成 3 月 2 日。
 */
export function parseArriveBy(
  raw: string,
): { ok: true; iso: string; epochMs: number; hkDate: string } | { ok: false; message: string } {
  const value = raw.trim();
  if (value === "") {
    return { ok: false, message: "arriveBy 不可為空。" };
  }

  const localMatch = LOCAL_DATE_TIME.exec(value);
  if (localMatch) {
    const [, year, month, day, hour, minute, second = "00"] = localMatch;
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${HK_OFFSET}`;
    const epochMs = Date.parse(iso);
    if (Number.isNaN(epochMs)) {
      return { ok: false, message: `arriveBy 不是有效的日期時間：${raw}。` };
    }
    const parts = zonedPartsFromEpoch(epochMs);
    // 檢查有問題的日期，例如 2 月 30 日或 25:00。
    if (parts.date !== `${year}-${month}-${day}` || parts.time !== `${hour}:${minute}`) {
      return { ok: false, message: `arriveBy 不是存在的日曆時間：${raw}。` };
    }
    return { ok: true, iso, epochMs, hkDate: parts.date };
  }

  if (FULL_ISO.test(value)) {
    const epochMs = Date.parse(value);
    if (Number.isNaN(epochMs)) {
      return { ok: false, message: `arriveBy 不是有效的 ISO 8601 時間：${raw}。` };
    }
    const parts = zonedPartsFromEpoch(epochMs);
    return {
      ok: true,
      iso: `${parts.date}T${parts.seconds}${HK_OFFSET}`,
      epochMs,
      hkDate: parts.date,
    };
  }

  return {
    ok: false,
    message: `arriveBy 格式無法辨識：${raw}。請使用 YYYY-MM-DDTHH:mm 或帶偏移量的 ISO 8601。`,
  };
}

/** 由 epoch 產生香港時區 ISO 字串（秒為單位，固定 +08:00 偏移）。 */
export function toHkIso(epochMs: number): string {
  const parts = zonedPartsFromEpoch(epochMs);
  return `${parts.date}T${parts.seconds}${HK_OFFSET}`;
}

/** 由香港時區的日期與「當日分鐘數」產生 ISO 字串。 */
export function hkIsoFromMinutes(date: string, minutesOfDay: number): string {
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  return `${date}T${pad(hour)}:${pad(minute)}:00${HK_OFFSET}`;
}

export function addMinutes(iso: string, minutes: number): string {
  return toHkIso(Date.parse(iso) + Math.round(minutes) * 60_000);
}

export function diffMinutes(later: string, earlier: string): number {
  return Math.round((Date.parse(later) - Date.parse(earlier)) / 60_000);
}

export function hkDateOf(iso: string): string {
  return zonedPartsFromEpoch(Date.parse(iso)).date;
}

export function hkMinutesOfDay(iso: string): number {
  const parts = zonedPartsFromEpoch(Date.parse(iso));
  return parts.hour * 60 + parts.minute;
}

/** 顯示用：`08:09`。 */
export function formatHkTime(iso: string): string {
  if (!iso) return "—";
  return zonedPartsFromEpoch(Date.parse(iso)).time;
}

/** 顯示用：`10 月 13 日（週二）08:09`。 */
export function formatHkDateTime(iso: string): string {
  if (!iso) return "—";
  const parts = zonedPartsFromEpoch(Date.parse(iso));
  return `${parts.month} 月 ${parts.day} 日（${parts.weekday}）${parts.time}`;
}

/** 顯示用：`2026-10-13 07:30`。 */
export function formatHkStamp(iso: string): string {
  if (!iso) return "—";
  const parts = zonedPartsFromEpoch(Date.parse(iso));
  return `${parts.date} ${parts.time}`;
}
