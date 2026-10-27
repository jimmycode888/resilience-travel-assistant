/**
 * 口岸條件與排隊區間估算（成員 B 所有）。
 *
 * 為什麼需要這個模組：
 *   口岸「實時排隊時間」**沒有任何公開官方來源**（香港側與深圳側皆無 API，
 *   開放資料目錄檢索 control point waiting time 命中 0 筆）。硬約束是**不得編造**，
 *   所以本模組只做兩件事，而且都如實標註：
 *     1. 用**可觀測的運力信號**（東鐵過境段班距、口岸側跨境巴士班距）＋時段／天氣／事件，
 *        估算出**區間 + 置信度**；
 *     2. 口岸開沒開、可通行方式，屬於**可核實的事實**，不是估算（走 `geo/ports.ts`）。
 *
 * 設計原則（與第一階段一致）：
 *   - 資料驅動：口岸→信號的對應寫在 `PORT_SIGNAL_SOURCES`，新增路線只改資料不改邏輯。
 *   - 可測試：fetch 與時鐘都可注入，標準測試**完全不連網**。
 *   - 三退路：live → cached → fixture；單一來源失敗不影響其他口岸。
 *   - 誠實：置信度上限為 `medium`（全是間接代理），永不輸出單點精確值。
 *
 * ⚠️ 基礎區間為**先驗假設**，未經歷史排隊資料校準；口岸座標與開放時間仍待官方核實
 *    （見 `geo/ports.ts` 的 `coordinatesVerified`）。
 */
import { z } from "zod";
import { withDeadline } from "./deadline";
import { holidayKind } from "./holidays";
import { findPort, isPortOpen, listPorts, type BorderPort } from "@/lib/geo/ports";
import { hkMinutesOfDay, parseArriveBy, toHkIso } from "@/lib/time";
import type { DataSourceInfo } from "@/lib/types/context";
import type { Confidence } from "@/lib/types/decision";
import type { BorderSignal, RiskWeather } from "@/lib/types/risk";
import type { RouteQuality } from "@/lib/types/route";

// ─────────────────────────────────────────────────────────────
// 1. 口岸 → 可觀測信號的對應（**資料驅動**）
//
// 每一筆的 line/station 或 route/stop 都以官方 route-stop / stop API 核對過
// （2026-10-12 實測），不是憑欄位名硬編。
// `typicalHeadwayMinutes` 是該來源的常態班距，只用來判斷「實測班距是否明顯變薄」。
// ─────────────────────────────────────────────────────────────

export type PortSignalKind = "mtr" | "citybus" | "kmb";

export interface PortSignalSource {
  id: string;
  kind: PortSignalKind;
  label: string;
  /** 未校準的政策比較基準（分鐘），不是官方班距。 */
  typicalHeadwayMinutes: number;
  mtr?: { line: string; station: string; destination: string };
  bus?: {
    company: "CTB" | "KMB";
    route: string;
    stop: string;
    /** I = inbound，O = outbound；一律選「以口岸為起點」的方向，量到站才算運力。 */
    direction: "I" | "O";
    serviceType?: string;
  };
}

export const PORT_SIGNAL_SOURCES: Readonly<Record<string, readonly PortSignalSource[]>> =
  Object.freeze({
    "lok-ma-chau": [
      {
        id: "mtr-eal-lmc",
        kind: "mtr",
        label: "港鐵東鐵線 落馬洲站",
        typicalHeadwayMinutes: 8,
        mtr: { line: "EAL", station: "LMC", destination: "ADM" },
      },
      {
        id: "kmb-b1-lmc",
        kind: "kmb",
        label: "九巴 B1 落馬洲站‧福田口岸",
        typicalHeadwayMinutes: 20,
        bus: { company: "KMB", route: "B1", stop: "81567ACCCF40DD4B", direction: "I", serviceType: "1" },
      },
    ],
    // 羅湖只有鐵路可通行，沒有巴士信號。
    "lo-wu": [
      {
        id: "mtr-eal-low",
        kind: "mtr",
        label: "港鐵東鐵線 羅湖站",
        typicalHeadwayMinutes: 6,
        mtr: { line: "EAL", station: "LOW", destination: "ADM" },
      },
    ],
    "shenzhen-bay": [
      {
        id: "ctb-b3x-szbay",
        kind: "citybus",
        label: "城巴 B3X 深圳灣口岸",
        typicalHeadwayMinutes: 20,
        bus: { company: "CTB", route: "B3X", stop: "003208", direction: "I" },
      },
      {
        id: "ctb-b3-szbay",
        kind: "citybus",
        label: "城巴 B3 深圳灣口岸",
        typicalHeadwayMinutes: 25,
        bus: { company: "CTB", route: "B3", stop: "003208", direction: "I" },
      },
      {
        id: "ctb-b3m-szbay",
        kind: "citybus",
        label: "城巴 B3M 深圳灣口岸",
        typicalHeadwayMinutes: 30,
        bus: { company: "CTB", route: "B3M", stop: "003208", direction: "O" },
      },
    ],
    "heung-yuen-wai": [
      {
        id: "ctb-b7-hyw",
        kind: "citybus",
        label: "城巴 B7 香園圍口岸",
        typicalHeadwayMinutes: 20,
        bus: { company: "CTB", route: "B7", stop: "003714", direction: "I" },
      },
      {
        id: "ctb-b8-hyw",
        kind: "citybus",
        label: "城巴 B8 香園圍口岸",
        typicalHeadwayMinutes: 30,
        bus: { company: "CTB", route: "B8", stop: "003714", direction: "I" },
      },
      {
        id: "kmb-b9-hyw",
        kind: "kmb",
        label: "九巴 B9 香園圍‧蓮塘口岸",
        typicalHeadwayMinutes: 30,
        bus: { company: "KMB", route: "B9", stop: "3ED28170B05A236E", direction: "I", serviceType: "1" },
      },
    ],
    // 皇崗以皇巴接駁，皇巴沒有公開 ETA API；文錦渡亦無公開 ETA。
    // 這裡刻意留空並如實降級，不用其他口岸的班次冒充。
    huanggang: [],
    "man-kam-to": [],
  });

export function signalSourcesFor(portId: string): readonly PortSignalSource[] {
  return PORT_SIGNAL_SOURCES[portId] ?? [];
}

// ─────────────────────────────────────────────────────────────
// 2. 先驗區間與加成（**未經歷史資料校準**）
// ─────────────────────────────────────────────────────────────

export type PortProfile = "rail" | "coach" | "remote";

/** 口岸性質。`remote` 代表班次疏落的小口岸。 */
export const PORT_PROFILES: Readonly<Record<string, PortProfile>> = Object.freeze({
  "lok-ma-chau": "rail",
  "lo-wu": "rail",
  huanggang: "coach",
  "shenzhen-bay": "coach",
  "heung-yuen-wai": "coach",
  "man-kam-to": "remote",
});

/** 註冊表沒有明列時，依可通行方式推斷性質。 */
export function profileFor(port: BorderPort): PortProfile {
  const explicit = PORT_PROFILES[port.id];
  if (explicit) return explicit;
  return port.modes.includes("mtr") ? "rail" : "coach";
}

/** ⚠️ 先驗區間（分鐘），未經歷史排隊資料校準。 */
export const QUEUE_PRIORS: Readonly<
  Record<PortProfile, { peak: [number, number]; offPeak: [number, number]; late: [number, number] }>
> = Object.freeze({
  rail: { peak: [15, 35], offPeak: [5, 15], late: [3, 10] },
  coach: { peak: [20, 45], offPeak: [10, 25], late: [5, 15] },
  remote: { peak: [25, 55], offPeak: [15, 35], late: [8, 20] },
});

export type BorderDirection = "hk_to_sz" | "sz_to_hk";

/** 北向早高峰 07:00–10:00；南向晚高峰 17:00–20:00（香港時間分鐘數）。 */
export const PEAK_WINDOWS: Readonly<Record<BorderDirection, readonly (readonly [number, number])[]>> =
  Object.freeze({
    hk_to_sz: [[420, 600]],
    sz_to_hk: [[1020, 1200]],
  });

export interface QueueAdjustments {
  /** 週末／公眾假期。 */
  readonly weekend: readonly [number, number];
  /** 暴雨或颱風級別。 */
  readonly severeWeather: readonly [number, number];
  /** 鐵路中斷（僅鐵路口岸）。 */
  readonly railDisruption: readonly [number, number];
  /** 運輸署公告命中此口岸。 */
  readonly portIncident: readonly [number, number];
  /** 實測班距明顯大於常態。 */
  readonly capacityThin: readonly [number, number];
  /** 深夜需求較低。 */
  readonly lateNight: readonly [number, number];
}

export const QUEUE_ADJUSTMENTS: QueueAdjustments = {
  weekend: [10, 20],
  severeWeather: [10, 25],
  railDisruption: [15, 35],
  portIncident: [10, 30],
  capacityThin: [5, 15],
  lateNight: [-3, 0],
};

/** 深夜：22:30 後或 06:30 前。 */
export const LATE_NIGHT_START = 22 * 60 + 30;
export const LATE_NIGHT_END = 6 * 60 + 30;

// ─────────────────────────────────────────────────────────────
// 3. 觀測：抓取可得的運力信號
// ─────────────────────────────────────────────────────────────

export interface PortObservation {
  portId: string;
  sourceId: string;
  label: string;
  sourceUrl: string;
  /** 實測班距中位數（分鐘）；資料不足兩班時為 null。 */
  observedHeadwayMinutes: number | null;
  /** 該來源的常態班距（分鐘），用於判斷實測班距是否明顯變薄。 */
  typicalHeadwayMinutes: number;
  /** 港鐵的延誤旗標（Y/N）。只有港鐵提供；null 代表這個來源沒有這個資訊。 */
  delayReported: boolean | null;
  /** 去重後的班次時間（ISO +08:00）。 */
  arrivals: readonly string[];
  /** 來源時間（ISO +08:00）。 */
  updatedAt: string;
  quality: RouteQuality;
  note: string | null;
}

const isoString = z.string().refine((value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && parseArriveBy(value).ok, "必須是帶時區的 ISO 時間");

const mtrPayload = z.object({
  status: z.number().optional(),
  isdelay: z.enum(["Y", "N"]).optional(),
  sys_time: z.string().optional(),
  curr_time: z.string().optional(),
  data: z.record(
    z.object({
      curr_time: z.string().optional(),
      UP: z.array(z.object({ dest: z.union([z.string(), z.number()]).optional(), time: z.string(), plat: z.union([z.string(), z.number()]).optional() })).optional(),
      DOWN: z.array(z.object({ dest: z.union([z.string(), z.number()]).optional(), time: z.string(), plat: z.union([z.string(), z.number()]).optional() })).optional(),
    }),
  ).optional(),
});

const busEtaRow = z.object({
  co: z.string().optional(),
  route: z.string().optional(),
  dir: z.string().optional(),
  eta: z.string().nullable().optional(),
  seq: z.union([z.string(), z.number()]).optional(),
  data_timestamp: z.string().optional(),
});
const busEtaPayload = z.object({
  generated_timestamp: z.string().optional(),
  data: z.array(busEtaRow).optional(),
});

/** 港鐵的本地時間沒有時區，依官方格式補上 +08:00。 */
export function mtrLocalToIso(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) throw new Error("港鐵時間格式非預期");
  const value = `${raw.replace(" ", "T")}+08:00`;
  isoString.parse(value);
  return value;
}

/**
 * 由一串班次時間算實測班距。
 *
 * 為什麼要先**去重**：九巴/城巴會對同一班車回傳多筆（eta_seq 1..3）帶相同 eta，
 * 不去重會把班距算成 0，把「運力正常」誤判成「運力充裕」。
 */
export function headwayMinutes(times: readonly (string | null | undefined)[]): number | null {
  const epochs = [...new Set(times.filter((v): v is string => typeof v === "string").map((v) => Date.parse(v)).filter(Number.isFinite))].sort((a, b) => a - b);
  if (epochs.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < epochs.length; i += 1) {
    const previous = epochs[i - 1] ?? 0;
    const current = epochs[i] ?? 0;
    gaps.push(Math.round((current - previous) / 60_000));
  }
  const sorted = [...gaps].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

export function sourceUrlOf(source: PortSignalSource): string {
  if (source.mtr) {
    return `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${source.mtr.line}&sta=${source.mtr.station}&lang=TC`;
  }
  const bus = source.bus!;
  if (bus.company === "CTB") {
    return `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${bus.stop}/${bus.route}`;
  }
  return `https://data.etabus.gov.hk/v1/transport/kmb/eta/${bus.stop}/${bus.route}/${bus.serviceType ?? "1"}`;
}

export interface CollectOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** 只抓這些口岸；未指定時抓全部。 */
  portIds?: readonly string[];
}

async function readJson(url: string, fetcher: typeof fetch, timeoutMs: number, outer?: AbortSignal): Promise<unknown> {
  return withDeadline(async (signal) => {
    const response = await fetcher(url, { signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, timeoutMs, outer);
}

function observationFrom(source: PortSignalSource, portId: string, raw: unknown, nowMs: number): PortObservation {
  const url = sourceUrlOf(source);
  const base = {
    portId,
    sourceId: source.id,
    label: source.label,
    sourceUrl: url,
    typicalHeadwayMinutes: source.typicalHeadwayMinutes,
    quality: "live" as const,
  };
  if (source.mtr) {
    const parsed = mtrPayload.parse(raw);
    if (parsed.status === 0) throw new Error("港鐵回傳特殊服務警示；未確認可用班次");
    const station = parsed.data?.[`${source.mtr.line}-${source.mtr.station}`];
    if (!station?.curr_time) throw new Error("港鐵缺少來源更新時間");
    const sourceTime = mtrLocalToIso(station.curr_time);
    if (Date.parse(sourceTime) < nowMs - 120000 || Date.parse(sourceTime) > nowMs + 60000) throw new Error("港鐵来源時間過期或超前");
    const rows = [...(station?.DOWN ?? []), ...(station?.UP ?? [])].filter(
      (row) => String(row.dest) === source.mtr!.destination,
    );
    const arrivals = rows
      .map((row) => mtrLocalToIso(row.time))
      .filter((iso) => Date.parse(iso) >= nowMs && Date.parse(iso) <= nowMs + 7_200_000)
      .sort();
    return {
      ...base,
      observedHeadwayMinutes: headwayMinutes(arrivals),
      delayReported: parsed.isdelay ? parsed.isdelay === "Y" : null,
      arrivals,
      updatedAt: sourceTime,
      note: rows.length === 0 ? "沒有往指定終點方向的班次；不代表停駛。" : null,
    };
  }

  const bus = source.bus!;
  const parsed = busEtaPayload.parse(raw);
  const sourceTime = isoString.parse(parsed.generated_timestamp);
  if (Date.parse(sourceTime) < nowMs - 120000 || Date.parse(sourceTime) > nowMs + 60000) throw new Error("巴士来源時間過期或超前");
  const rows = (parsed.data ?? []).filter(
    (row) => (!row.route || row.route === bus.route) && (!row.dir || row.dir === bus.direction),
  );
  const arrivals = rows
    .map((row) => row.eta ?? null)
    .filter((v): v is string => typeof v === "string" && isoString.safeParse(v).success)
    .filter((iso) => Date.parse(iso) >= nowMs && Date.parse(iso) <= nowMs + 7_200_000)
    .sort();
  const remark = rows.map((row) => (row as { rmk_tc?: string }).rmk_tc).find((v) => typeof v === "string" && v.length > 0) ?? null;
  return {
    ...base,
    observedHeadwayMinutes: headwayMinutes(arrivals),
    delayReported: null,
    arrivals,
    updatedAt: sourceTime,
    note: arrivals.length === 0 ? "此站此方向目前沒有 ETA；可能是非服務時段，不代表停駛。" : remark,
  };
}

/**
 * 抓取所有口岸的可觀測信號。
 *
 * 單一來源失敗不會讓整體失敗：該來源回傳 `quality: "fixture"` 的空觀測，
 * 並在 note 說明原因；其他口岸照常。
 */
export async function collectPortObservations(options: CollectOptions = {}): Promise<PortObservation[]> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 2500;
  const portIds = options.portIds ?? listPorts().map((port) => port.id);
  const nowMs = now();

  const jobs: Array<{ portId: string; source: PortSignalSource }> = [];
  for (const portId of portIds) {
    for (const source of signalSourcesFor(portId)) jobs.push({ portId, source });
  }

  const settled = await Promise.all(
    jobs.map(async ({ portId, source }) => {
      const url = sourceUrlOf(source);
      try {
        const raw = await readJson(url, fetcher, timeoutMs, options.signal);
        return observationFrom(source, portId, raw, nowMs);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          portId,
          sourceId: source.id,
          label: source.label,
          sourceUrl: url,
          observedHeadwayMinutes: null,
          typicalHeadwayMinutes: source.typicalHeadwayMinutes,
          delayReported: null,
          arrivals: [] as readonly string[],
          updatedAt: toHkIso(nowMs),
          quality: "fixture" as const,
          note: `${source.label} 取不到（${reason}）；此口岸本次沒有運力信號。`,
        } satisfies PortObservation;
      }
    }),
  );

  return settled;
}

// ─────────────────────────────────────────────────────────────
// 4. 估算：純函式，輸入相同必得相同輸出
// ─────────────────────────────────────────────────────────────

export interface EstimateInput {
  portId: string;
  /** 抵達口岸的預計時間（ISO，含 +08:00）。 */
  at: string;
  direction?: BorderDirection;
  weather?: RiskWeather | null;
  railDisrupted?: boolean;
  /** 運輸署公告是否命中此口岸。 */
  portIncident?: boolean;
  observations?: readonly PortObservation[];
  /** 資料品質（live / cached / fixture）。 */
  quality?: RouteQuality;
}

export interface BorderQueueEstimate {
  portId: string;
  portName: string;
  /** 口岸在該時間是否開放（依 `geo/ports.ts`；該資料仍待官方核實）。 */
  open: boolean;
  queueMinutesRange: [number, number] | null;
  confidence: Confidence;
  /** 逐項依據，讓任何數字都能回溯。 */
  basis: string[];
  note: string;
  signal: BorderSignal | null;
}

const clamp = (range: [number, number]): [number, number] => [
  Math.max(0, Math.round(range[0])),
  Math.max(1, Math.round(range[1])),
];
const addRange = (a: [number, number], b: readonly [number, number]): [number, number] => [a[0] + b[0], a[1] + b[1]];

/**
 * 估算某一口岸在某一時刻的排隊區間。
 *
 * 純函式：不讀時鐘、不打網路。所有輸入都必須由呼叫端提供。
 * 口岸未開放時回傳 `queueMinutesRange: null`（不可行），而不是給一個假的數字。
 */
export function estimateBorderQueue(input: EstimateInput): BorderQueueEstimate {
  const port = findPort(input.portId);
  const at = parseArriveBy(input.at);
  if (!port || !at.ok) {
    return {
      portId: input.portId,
      portName: port?.name ?? input.portId,
      open: false,
      queueMinutesRange: null,
      confidence: "low",
      basis: [port ? "時間無法解析。" : "口岸不在註冊表中。"],
      note: "缺少可核對的口岸或有效時間，不提供排隊估算。",
      signal: null,
    };
  }

  const open = isPortOpen(port, at.iso);
  if (!open) {
    return {
      portId: port.id,
      portName: port.name,
      open: false,
      queueMinutesRange: null,
      confidence: "low",
      basis: ["口岸在該時段未開放。"],
      note: `${port.name}在 ${at.iso} 未開放，屬不可行情境，不提供排隊估算。`,
      signal: null,
    };
  }

  const minute = hkMinutesOfDay(at.iso);
  const shifted = new Date(Date.parse(at.iso) + 8 * 3_600_000);
  const weekday = shifted.getUTCDay();
  const holiday = holidayKind(at.iso);
  const weekend = weekday === 0 || weekday === 6 || holiday === "holiday";
  const late = minute >= LATE_NIGHT_START || minute < LATE_NIGHT_END;
  const direction: BorderDirection = input.direction ?? (minute < 12 * 60 ? "hk_to_sz" : "sz_to_hk");
  const peak = !late && PEAK_WINDOWS[direction].some(([from, to]) => minute >= from && minute < to);
  const band: "peak" | "offPeak" | "late" = late ? "late" : peak ? "peak" : "offPeak";

  const profile = profileFor(port);
  let range: [number, number] = [...QUEUE_PRIORS[profile][band]];
  const basis = [`${profile} / ${band} 先驗區間 ${range[0]}–${range[1]}`];

  if (weekend) {
    range = addRange(range, QUEUE_ADJUSTMENTS.weekend);
    basis.push(`${holiday === "holiday" ? "公眾假期" : "週末"} +${QUEUE_ADJUSTMENTS.weekend[0]}~${QUEUE_ADJUSTMENTS.weekend[1]}`);
  }
  if (late) {
    range = addRange(range, QUEUE_ADJUSTMENTS.lateNight);
    basis.push("深夜需求較低 -3~0");
  }
  const severe = input.weather?.condition === "storm" || input.weather?.condition === "heavy_rain";
  if (severe) {
    range = addRange(range, QUEUE_ADJUSTMENTS.severeWeather);
    basis.push(`惡劣天氣（${input.weather!.condition}） +${QUEUE_ADJUSTMENTS.severeWeather[0]}~${QUEUE_ADJUSTMENTS.severeWeather[1]}`);
  }
  if (input.railDisrupted && port.modes.includes("mtr")) {
    range = addRange(range, QUEUE_ADJUSTMENTS.railDisruption);
    basis.push(`鐵路服務中斷擠向口岸 +${QUEUE_ADJUSTMENTS.railDisruption[0]}~${QUEUE_ADJUSTMENTS.railDisruption[1]}`);
  }
  if (input.portIncident) {
    range = addRange(range, QUEUE_ADJUSTMENTS.portIncident);
    basis.push(`運輸署公告命中此口岸 +${QUEUE_ADJUSTMENTS.portIncident[0]}~${QUEUE_ADJUSTMENTS.portIncident[1]}`);
  }

  // 只用「有量到東西」的觀測：live 與 cached 都算（cached 仍在來源效期內），
  // fixture 觀測一律沒有班距，自然被排除。不能因為整體降為 cached 就把班距信號丟掉。
  const observations = (input.observations ?? []).filter((o) => o.quality !== "fixture");
  const headways = observations.map((o) => ({ o, headway: o.observedHeadwayMinutes }));
  const thin = headways.some(
    ({ o, headway }) => headway !== null && headway >= o.typicalHeadwayMinutes * 1.6,
  );
  if (thin) {
    range = addRange(range, QUEUE_ADJUSTMENTS.capacityThin);
    basis.push(`實測班距明顯大於常態 → 運力變薄 +${QUEUE_ADJUSTMENTS.capacityThin[0]}~${QUEUE_ADJUSTMENTS.capacityThin[1]}`);
  }
  const measured = headways.filter(({ headway }) => headway !== null);
  if (measured.length > 0) {
    basis.push(`實測班距 ${measured.map(({ o, headway }) => `${o.label} ${headway} 分`).join("、")}`);
  } else {
    basis.push(observations.length > 0 ? "有來源回應但無足夠班次可算班距" : "此口岸沒有運力信號（來源未接入或無公開 API）");
  }

  const rangeClamped = clamp(range);
  const quality = input.quality ?? "live";
  // 置信度上限一律為 medium：所有信號都是間接代理，沒有任何來源直接觀測排隊。
  const confidence: Confidence = quality !== "fixture" && measured.length > 0 ? "medium" : "low";

  const note = [
    `${port.name}排隊 ${rangeClamped[0]}–${rangeClamped[1]} 分鐘（估算）`,
    `依據：${basis.join("；")}`,
    "非官方實時排隊資料；區間來自運力信號與時段先驗，未經歷史資料校準。",
    quality === "fixture" ? "本次沒有實時來源，為演示估算。" : null,
  ]
    .filter(Boolean)
    .join("｜");

  return {
    portId: port.id,
    portName: port.name,
    open: true,
    queueMinutesRange: rangeClamped,
    confidence,
    basis,
    note,
    signal: { portId: port.id, queueMinutesRange: rangeClamped, confidence, note },
  };
}

// ─────────────────────────────────────────────────────────────
// 5. 客戶端：live → cached → fixture 三退路
//
// 讀取快取 30 秒（與 `TransportTimeClient` 一致）；來源效期 2 分鐘。
// 快取只在記憶體，重啟即清空——本專案不引入資料庫。
// ─────────────────────────────────────────────────────────────

export const PORT_OBSERVATION_READ_CACHE_MS = 30_000;
export const PORT_OBSERVATION_TTL_MS = 120_000;

export interface ResolveBorderConditionsOptions {
  /** 抵達口岸／通關的預計時間（ISO，含 +08:00）。 */
  at: string;
  direction?: BorderDirection;
  weather?: RiskWeather | null;
  railDisrupted?: boolean;
  /** 運輸署公告命中的口岸 ID。 */
  incidentPortIds?: readonly string[];
  /** 只估算這些口岸；未指定時為全部。 */
  portIds?: readonly string[];
  signal?: AbortSignal;
}

export interface BorderConditions {
  at: string;
  /** 這批估算實際命中的最低品質（沿用 live → cached → fixture）。 */
  quality: RouteQuality;
  byPort: Record<string, BorderQueueEstimate>;
  /** 每個口岸本次實際用到的觀測（供呼叫端取用班距／延誤旗標）。 */
  observationsByPort: Record<string, PortObservation[]>;
  notices: string[];
  /** 逐來源的品質標註，供 API 的 dataSources 面板使用。 */
  sources: DataSourceInfo[];
}

interface CachedObservations {
  observations: PortObservation[];
  storedAtMs: number;
}

/** 觀測結果的讀取快取（30 秒）＋離線退路。 */
export class PortConditionClient {
  private readonly cache = new Map<string, CachedObservations>();

  constructor(
    private readonly deps: {
      fetcher?: typeof fetch;
      now?: () => number;
      timeoutMs?: number;
      readCacheMs?: number;
      ttlMs?: number;
    } = {},
  ) {}

  private get now(): () => number {
    return this.deps.now ?? Date.now;
  }

  /** 清空快取（測試與長駐服務可用）。 */
  clear(): void {
    this.cache.clear();
  }

  private cachedFor(portId: string): PortObservation[] | null {
    const entry = this.cache.get(portId);
    if (!entry) return null;
    const ttl = this.deps.ttlMs ?? PORT_OBSERVATION_TTL_MS;
    if (this.now() - entry.storedAtMs >= ttl || entry.observations.some((row) => row.quality !== "fixture" && Date.parse(row.updatedAt) + ttl <= this.now())) {
      this.cache.delete(portId);
      return null;
    }
    return entry.observations;
  }

  private store(portId: string, observations: PortObservation[]): void {
    if (observations.some((o) => o.quality === "live")) {
      this.cache.set(portId, { observations, storedAtMs: this.now() });
    }
  }

  /**
   * 取得每個口岸的觀測，並逐口岸決定品質層級。
   *
   * 逐口岸而不是整體：深圳灣取得到、文錦渡取不到時，
   * 不應該讓文錦渡的失敗把深圳灣也降級。
   */
  private async observationsByPort(
    portIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<{ byPort: Map<string, PortObservation[]>; tiers: Map<string, RouteQuality>; notices: string[] }> {
    const notices: string[] = [];
    const readCacheMs = this.deps.readCacheMs ?? PORT_OBSERVATION_READ_CACHE_MS;
    const cachedHit = portIds.filter((portId) => {
      const entry = this.cache.get(portId);
      return entry !== undefined && this.now() - entry.storedAtMs < readCacheMs;
    });

    const byPort = new Map<string, PortObservation[]>();
    const tiers = new Map<string, RouteQuality>();

    for (const portId of cachedHit) {
      byPort.set(portId, this.cache.get(portId)!.observations.map((o) => ({ ...o, quality: "cached" as const })));
      tiers.set(portId, "cached");
    }

    const toFetch = portIds.filter((portId) => !cachedHit.includes(portId));
    if (toFetch.length > 0) {
      const collected = await collectPortObservations({
        fetcher: this.deps.fetcher,
        now: this.now,
        timeoutMs: this.deps.timeoutMs,
        signal,
        portIds: toFetch,
      });
      for (const portId of toFetch) {
        const rows = collected.filter((o) => o.portId === portId);
        const live = rows.filter((o) => o.quality === "live");
        if (live.length > 0) {
          byPort.set(portId, rows);
          tiers.set(portId, "live");
          this.store(portId, rows);
          continue;
        }
        const cached = this.cachedFor(portId);
        if (cached) {
          byPort.set(portId, cached.map((o) => ({ ...o, quality: "cached" as const })));
          tiers.set(portId, "cached");
          notices.push(`${portId} 本次取不到實時來源，已使用 2 分鐘內的有效快取。`);
          continue;
        }
        byPort.set(portId, rows);
        tiers.set(portId, "fixture");
        if (signalSourcesFor(portId).length === 0) {
          notices.push(`${portId} 沒有公開的班次信號來源（例如皇巴、文錦渡），排隊僅為先驗估算。`);
        } else {
          notices.push(`${portId} 的班次信號來源全部失敗，已降為先驗估算。`);
        }
      }
    }

    return { byPort, tiers, notices };
  }

  /** 估算多個口岸的排隊區間，並回報實際命中的品質層級。 */
  async resolve(options: ResolveBorderConditionsOptions): Promise<BorderConditions> {
    const portIds = options.portIds ?? listPorts().map((port) => port.id);
    const { byPort, tiers, notices } = await this.observationsByPort(portIds, options.signal);
    const rank: RouteQuality[] = ["fixture", "cached", "live"];
    const qualityOf = (portId: string): RouteQuality => tiers.get(portId) ?? "fixture";

    const estimates: Record<string, BorderQueueEstimate> = {};
    for (const portId of portIds) {
      estimates[portId] = estimateBorderQueue({
        portId,
        at: options.at,
        direction: options.direction,
        weather: options.weather,
        railDisrupted: options.railDisrupted,
        portIncident: options.incidentPortIds?.includes(portId) ?? false,
        observations: byPort.get(portId) ?? [],
        quality: qualityOf(portId),
      });
    }

    // 整體品質只由**真的有信號來源**的口岸決定：皇崗／文錦渡本來就沒有公開來源，
    // 不應該把整體拖成 fixture（那只會掩蓋其他口岸其實是 live）。
    const usedTiers = portIds.filter((portId) => signalSourcesFor(portId).length > 0).map(qualityOf);
    const quality: RouteQuality = usedTiers.length === 0 ? "fixture" : usedTiers.reduce((worst, t) => (rank.indexOf(t) < rank.indexOf(worst) ? t : worst), "live");

    const sources: DataSourceInfo[] = portIds.flatMap((portId): DataSourceInfo[] => {
      const rows = byPort.get(portId) ?? [];
      const tier = qualityOf(portId);
      const sources_ = signalSourcesFor(portId);
      if (sources_.length === 0) {
        return [{
          id: `port-${portId}`,
          label: `${findPort(portId)?.name ?? portId}排隊（先驗估算）`,
          url: null,
          quality: "fixture" as const,
          updatedAt: options.at,
          note: "此口岸沒有公開的班次信號來源，排隊僅為先驗估算，非實時資料。",
        }];
      }
      return rows.map((row) => ({
        id: `port-${portId}-${row.sourceId}`,
        label: `${findPort(portId)?.name ?? portId}：${row.label}`,
        url: row.sourceUrl,
        quality: row.quality === "live" ? tier : row.quality,
        updatedAt: row.updatedAt,
        note: row.observedHeadwayMinutes === null
          ? "有回應但無足夠班次可算班距；不能推論停駛。"
          : `實測班距 ${row.observedHeadwayMinutes} 分（政策比較基準 ${row.typicalHeadwayMinutes} 分，非官方班距）。`,
      }));
    });

    const observationsByPort: Record<string, PortObservation[]> = {};
    for (const portId of portIds) observationsByPort[portId] = byPort.get(portId) ?? [];

    return { at: options.at, quality, byPort: estimates, observationsByPort, notices, sources };
  }
}

/** 共享實例：適合同一個請求內重複查詢（30 秒讀取快取）。 */
export const portConditionClient = new PortConditionClient();
