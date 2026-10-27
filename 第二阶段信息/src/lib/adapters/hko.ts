import { z } from "zod";
import { parseArriveBy, toHkIso } from "@/lib/time";
import type { WeatherSnapshot } from "@/lib/types";

const timestamp = z.string().refine((value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && parseArriveBy(value).ok);
const reportSchema = z.object({
  updateTime: timestamp,
  icon: z.array(z.number().int()).min(1),
  temperature: z.object({ data: z.array(z.object({ place: z.string(), value: z.number().finite().min(-50).max(60), unit: z.literal("C") })) }).optional(),
});
const warningSchema = z.record(z.object({
  name: z.string().min(1), code: z.string().min(1),
  actionCode: z.enum(["ISSUE", "REISSUE", "CANCEL", "EXTEND", "UPDATE"]),
  updateTime: timestamp, expireTime: timestamp.optional(),
}));

/** Official rhrread + warnsum. Rainfall district maxima are not point rainfall rates. */
export function normalizeHko(reportRaw: unknown, warningRaw: unknown, nowMs = Date.now()): WeatherSnapshot {
  const report = reportSchema.parse(reportRaw);
  const warnings = warningSchema.parse(warningRaw);
  const active = Object.values(warnings).filter((w) => w.actionCode !== "CANCEL" && w.code !== "CANCEL" && (!w.expireTime || Date.parse(w.expireTime) > nowMs));
  const rain = active.find((w) => ["WRAINA", "WRAINR", "WRAINB"].includes(w.code));
  const thunder = active.some((w) => w.code === "WTS" || /^TC(?:8|9|10)/.test(w.code));
  const rainy = report.icon.some((icon) => [53, 54, 62, 63].includes(icon));
  const sunny = report.icon.every((icon) => [50, 51, 52, 70, 71, 72, 73, 74, 75, 77].includes(icon));
  const temperature = report.temperature?.data.find((v) => v.place === "將軍澳");
  const rainLabels: Record<string, string> = { WRAINA: "黃色暴雨警告信號", WRAINR: "紅色暴雨警告信號", WRAINB: "黑色暴雨警告信號" };
  return {
    condition: rain || report.icon.includes(64) ? "heavy_rain" : thunder || report.icon.includes(65) ? "storm" : rainy ? "rain" : sunny ? "clear" : "cloudy",
    warning: active.length ? active.map((w) => rainLabels[w.code] ?? w.name).join("；") : null,
    rainfallMmPerHour: null,
    temperatureC: temperature?.value ?? null,
    updatedAt: toHkIso(Date.parse(report.updateTime)),
    note: "天氣狀況由官方圖示及生效警告映射；氣溫取將軍澳站，缺測為 null。分區雨量上限不等於沿途每小時雨量，故雨量率保留 null。警告與報告為分開擷取，非原子快照。",
  };
}
