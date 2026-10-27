import calendar from "./data/hk-holidays.json";
import { parseArriveBy } from "@/lib/time";
const dates = new Set(calendar.dates);
/** Sundays/weekends are separately handled; out-of-calendar years remain unknown. */
export function holidayKind(iso: string): "holiday" | "ordinary" | "unknown" {
  const parsed = parseArriveBy(iso);
  if (!parsed.ok || !calendar.years.includes(parsed.hkDate.slice(0, 4))) return "unknown";
  return dates.has(parsed.hkDate) ? "holiday" : "ordinary";
}
