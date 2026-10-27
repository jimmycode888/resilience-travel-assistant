import { z } from "zod";
import { parseArriveBy } from "@/lib/time";
import type { LiveDataPayload } from "./types";
const iso = z.string().refine((v) => /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && parseArriveBy(v).ok);
const schema = z.object({
  weather: z.object({ condition: z.enum(["clear", "cloudy", "rain", "heavy_rain", "storm"]), warning: z.string().nullable(), rainfallMmPerHour: z.number().finite().min(0).max(1000).nullable(), temperatureC: z.number().finite().min(-50).max(60).nullable(), note: z.string().nullable(), updatedAt: iso }).optional(),
  routes: z.array(z.object({ routeId: z.enum(["R1", "R2", "R3"]), status: z.enum(["ok", "delayed", "disrupted", "unknown"]), delayMinutes: z.number().finite().min(0).max(1440), crowding: z.enum(["low", "medium", "high", "unknown"]), note: z.string().nullable(), affectedSegments: z.array(z.string()), updatedAt: iso })).refine((routes) => new Set(routes.map((r) => r.routeId)).size === 3 && routes.length === 3).optional(),
  incidents: z.array(z.object({ id: z.string(), kind: z.enum(["mtr", "bus", "road", "weather", "other"]), title: z.string(), detail: z.string(), since: iso })).optional(),
}).refine((p) => p.weather !== undefined || p.routes !== undefined || p.incidents !== undefined);
export function validateLivePayload(raw: unknown): LiveDataPayload { return schema.parse(raw); }
