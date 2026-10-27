/**
 * 正式團隊行程端點（`POST /api/team-journey`）的伺服器邏輯。
 *
 * 與 `/api/journey` 刻意分開：
 *   - `/api/journey`  → 離線演示契約 `JourneyAnalysis`（A 的 demo 頁）
 *   - 本端點          → 正式組合契約 `TeamJourneyResult`（D 的 `/journey-team` 正式模式）
 * 兩份契約不得互相強制轉型。
 *
 * B/C 注入點在下方 `teamModules`。
 *   - C：**已交付** `decide`（C1–C5：人流／通關／出發窗口／獨立備選／可溯源解釋），
 *        由 `@/lib/decision/team-decide` 提供；只消費 A 已算好的核心結果，不升用被排除的路線。
 *   - B：已注入資料適配器；未配置時回 null，來源失敗時明示回退。
 * 不生成 fixture 包裝、不模擬 B 的資料，避免把演示值冒充為正式結果。
 */
import { z } from "zod";
import { createRouteDataResolver } from "@/lib/adapters/team-data";
import { decideTeamJourney } from "@/lib/decision/team-decide";
import { createTeamJourneyService, resolveRoutes } from "@/lib/integration";
import { findPlace } from "@/lib/geo/places";
import { RouteResolutionError } from "@/lib/route/adapter";
import { parseArriveBy, toHkIso } from "@/lib/time";
import type { TeamJourneyModules, TeamJourneyResult } from "@/lib/types/team-integration";
import { apiError, type ApiErrorBody } from "./errors";

const journeyMode = z.enum(["walk", "mtr", "bus", "minibus", "tram", "ferry", "cross_border_bus", "hsr"]);

const schema = z
  .object({
    origin: z.string().min(1).max(120),
    destination: z.string().min(1).max(120),
    departAt: z.string().min(1).max(40),
    arriveBy: z.string().min(1).max(40).optional(),
    mode: z.enum(["fastest", "reliable", "less_crowded", "balanced"]).default("balanced"),
    preferPortId: z.string().min(1).max(60).optional(),
    modes: z.array(journeyMode).min(1).optional(),
  })
  .strict();

/** B/C 的注入點：B 交付 `resolveRouteData`、C 交付 `decide` 時只改這個物件。 */
export const teamModules: TeamJourneyModules = {
  resolveCandidates: async (query) => (await resolveRoutes({ query, providers: [] })).resolution,
  // B 已交付：未設定任何實時來源環境變數時仍回 null（保守路徑），
  // 設定 HKO_OPEN_DATA_BASE_URL / TD_SPECIAL_TRAFFIC_NEWS_URL / MTR_NEXT_TRAIN_ENABLED / TEAM_LIVE_DATA_ENABLED
  // 之後才提供天氣、交通公告與口岸排隊估算（區間 + 置信度）。
  resolveRouteData: createRouteDataResolver(),
  // C 已交付決策模型（C1–C5）：從 A 的核心結果產生正式 action / 出發窗口 / 獨立備選 / 可溯源解釋。
  decide: async (core) => decideTeamJourney(core),
};

export interface TeamJourneyHandlerResult {
  status: 200 | 400 | 500;
  body: unknown | ApiErrorBody;
}

export async function handleTeamJourneyRequest(
  raw: unknown,
  now: () => number = Date.now,
): Promise<TeamJourneyHandlerResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 400,
      body: apiError("INVALID_INPUT", "請檢查起終點、香港時間與行程模式。", parsed.error.issues.map((issue) => issue.message)),
    };
  }
  const input = parsed.data;
  const departure = parseArriveBy(input.departAt);
  const arrival = input.arriveBy ? parseArriveBy(input.arriveBy) : null;
  const originPlace = findPlace(input.origin);
  const destinationPlace = findPlace(input.destination);
  const invalid =
    !departure.ok ||
    (arrival !== null && !arrival.ok) ||
    !originPlace ||
    !destinationPlace ||
    originPlace.id === destinationPlace.id ||
    (arrival?.ok === true && departure.ok && arrival.epochMs <= departure.epochMs);
  if (invalid) {
    return {
      status: 400,
      body: apiError("INVALID_INPUT", "請選擇不同的已收錄起終點，並讓到達期限晚於出發時間。"),
    };
  }
  try {
    const evaluate = createTeamJourneyService(teamModules);
    const normalized = {
      ...input,
      departAt: departure.iso,
      arriveBy: arrival?.ok ? arrival.iso : undefined,
    };
    const evaluatedAt = toHkIso(now());
    const result = await evaluate(normalized, evaluatedAt);
    result.notices.push(result.routes.some((route) => route.data !== null)
      ? "B 資料適配與 C 決策已接入；請按逐路線品質與來源判讀，排隊仍是未校準估算。"
      : "B 資料來源未啟用，採保守資料退路；C 決策已接入，排隊與風險為未校準估算。");
    return { status: 200, body: result };
  } catch (error) {
    // 走廊未收錄不是伺服器故障：回傳合法但無候選的結果，讓前端顯示「無方案」而非錯誤。
    if (error instanceof RouteResolutionError && (error.code === "NO_ROUTES" || error.code === "INVALID_COORDINATE")) {
      const empty: TeamJourneyResult = {
        request: {
          ...input,
          departAt: departure.iso,
          arriveBy: arrival?.ok ? arrival.iso : undefined,
        },
        evaluatedAt: toHkIso(now()),
        routes: [],
        recommendedRouteId: null,
        notices: [`此走廊尚未收錄候選路線：${error.message}`, "正式端點已接線；此行程無已收錄候選，不生成路線或交通事實。"],
        decision: null,
      };
      return { status: 200, body: empty };
    }
    return { status: 500, body: apiError("INTERNAL_ERROR", "行程組合暫時無法完成，請重試。") };
  }
}
