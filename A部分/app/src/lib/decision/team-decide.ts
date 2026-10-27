/**
 * 第二階段正式決策入口（成員 C）—— `POST /api/team-journey` 的注入點。
 *
 * 契約：`TeamJourneyModules.decide(core) => Promise<TeamDecisionResult>`
 *   （見 `src/lib/types/team-integration.ts`，契約所有者：成員 A）。
 *
 * 職責：
 *   - 只消費 A 已經算好的 `TeamCoreResult`（候選路線 + 風險 + 可靠性）；
 *   - **不得把 A 已排除的路線升為推薦**（`eligible === false` 一律不可用）；
 *   - 產生 `action` / `primaryRouteId` / `backupRouteIds` / `departureWindow` / `explanations`。
 *
 * 模組分工：
 *   - C1 `@/lib/crowd`    → 時段人流風險（出發窗口的時變項）
 *   - C2 `@/lib/border`   → 口岸排隊區間與開放時間（跨境時變項）
 *   - C3 `@/lib/departure`→ 最佳出發窗口
 *   - C4 `@/lib/plan`     → Plan B（含跨境換口岸）與切換條件
 *   - C5 `@/lib/ai`       → 解釋層（模板 + 白名單 + 可注入模型）
 *
 * 決定性：同輸入同輸出；模型層（若有）只影響解釋文字，不影響任何決策欄位。
 */
import { addMinutes, diffMinutes } from "@/lib/time";
import { RISK_LEVEL_CUTOFFS, weightsFor } from "@/lib/risk/thresholds";
import { assessCrowd, crowdScoreOf } from "@/lib/crowd";
import { assessBorder } from "@/lib/border";
import { searchDepartureWindow, type DepartureSample } from "@/lib/departure";
import { selectBackup, type PlanRouteView } from "@/lib/plan";
import { explainTeamDecision, type ExplainTeamOptions } from "@/lib/ai";
import { findRiskFactor } from "@/lib/types/risk";
import type { Confidence } from "@/lib/types/decision";
import type { TeamCoreResult, TeamDecisionResult, TeamRouteResult } from "@/lib/types/team-integration";

/**
 * 惡劣天氣（黑雨／八號以上）的安全門檻。
 *
 * **與 A 的口徑對齊**（第二階段進度匯報的 C 缺口 3）：值直接取 A 的
 * `RISK_LEVEL_CUTOFFS.high`（= 風險等級「高」的切點），不再硬編 70。
 * 語意同 A 的嚴重天氣暫緩：weather 因子達「高風險」**且**主路以路面為主才暫緩；
 * 主路為室內候車的鐵路時不觸發（沿用第一階段 `SEVERE_WEATHER_RULES` 的原則）。
 */
export const SEVERE_WEATHER_HOLD_SCORE = RISK_LEVEL_CUTOFFS.high;

export interface DecideTeamOptions {
  /** 解釋層選項（可注入模型；未提供時用模板）。 */
  explain?: ExplainTeamOptions;
}

function trunkLinesOf(route: TeamRouteResult): string[] {
  const lines = route.candidate.journey.segments
    .filter((segment) => segment.mode !== "walk" && segment.durationMinutes >= 20 && segment.line)
    .map((segment) => segment.line as string);
  return [...new Set(lines)];
}

function toPlanView(route: TeamRouteResult): PlanRouteView {
  return {
    routeId: route.candidate.id,
    label: route.candidate.label,
    eligible: route.eligible && route.exclusions.length === 0,
    meetsDeadline: route.meetsDeadline,
    rankScore: route.assessment.rankScore,
    crossesBorder: route.candidate.journey.crossesBorder,
    portIds: route.candidate.journey.borderPortIds,
    trunkLines: trunkLinesOf(route),
  };
}

/** 主路是否以鐵路（室內候車）為主 → 黑雨安全規則不觸發。 */
function railDominant(route: TeamRouteResult): boolean {
  const rides = route.candidate.journey.segments
    .filter((segment) => segment.mode !== "walk")
    .sort((a, b) => b.durationMinutes - a.durationMinutes);
  const longest = rides[0];
  return longest?.mode === "mtr" || longest?.mode === "tram" || longest?.mode === "hsr";
}

interface PrimaryPick {
  primary: TeamRouteResult | null;
  /** 是否因為 A 的推薦趕不上期限而改選其他可行候選。 */
  overrodeRecommendation: boolean;
}

/** 排序：先滿足到達期限，再比排名分，最後用 routeId 保證確定性。 */
function rankByDeadlineThenScore(a: TeamRouteResult, b: TeamRouteResult): number {
  const deadlineRank = (route: TeamRouteResult) => (route.meetsDeadline === false ? 1 : 0);
  const byDeadline = deadlineRank(a) - deadlineRank(b);
  if (byDeadline !== 0) return byDeadline;
  if (b.assessment.rankScore !== a.assessment.rankScore) return b.assessment.rankScore - a.assessment.rankScore;
  return a.candidate.id.localeCompare(b.candidate.id);
}

/**
 * 選主路。
 *
 * - 尊重 A 的推薦，**但只在它沒有趕不上到達期限時**（回應 D2-05：
 *   基礎排序允許「到達超時」的候選被推薦，C 不得把它當成可執行的主路）；
 * - 否則在可行候選中取「先滿足期限、再比排名分」的最佳者，並回報已覆寫 A 的推薦。
 */
function pickPrimary(eligible: TeamRouteResult[], recommendedRouteId: string | null): PrimaryPick {
  if (eligible.length === 0) return { primary: null, overrodeRecommendation: false };
  const recommended = recommendedRouteId
    ? eligible.find((route) => route.candidate.id === recommendedRouteId)
    : undefined;
  if (recommended && recommended.meetsDeadline !== false) {
    return { primary: recommended, overrodeRecommendation: false };
  }
  const best = [...eligible].sort(rankByDeadlineThenScore)[0]!;
  return {
    primary: best,
    overrodeRecommendation: Boolean(recommended && recommended.candidate.id !== best.candidate.id),
  };
}

function factorScore(route: TeamRouteResult, id: "weather" | "crowd" | "disruption" | "transfer" | "border"): number {
  const factor = findRiskFactor(route.assessment.risk, id);
  return factor ? factor.score : 0;
}

/** 為出發窗口建立「時間 → 風險」取樣器（只變動與時間有關的因子）。 */
function makeSampler(core: TeamCoreResult, primary: TeamRouteResult) {
  const journey = primary.candidate.journey;
  const weights = weightsFor(journey.crossesBorder);
  const weatherScore = factorScore(primary, "weather");
  const disruptionScore = factorScore(primary, "disruption");
  const transferScore = factorScore(primary, "transfer");
  const quality = primary.assessment.risk.quality;
  const majorInterchange = journey.segments.some((segment) => segment.mode === "mtr" && segment.durationMinutes >= 20);
  const officeDensity = journey.crossesBorder ? "high" : "medium";
  const arriveBy = core.request.arriveBy ?? null;
  const baseEtaHigh = primary.assessment.reliability.etaRange[1];

  return (departAt: string): DepartureSample => {
    const offset = diffMinutes(departAt, core.request.departAt);
    const crowd = assessCrowd({
      at: departAt,
      majorInterchange,
      officeDensity,
      crossesBorder: journey.crossesBorder,
      quality,
    });
    let borderScore = 0;
    if (journey.crossesBorder) {
      const portId = journey.borderPortIds[0] ?? null;
      const border = assessBorder({
        portId,
        at: departAt,
        direction: "hk_to_sz",
        quality,
      });
      borderScore = border.open && border.queueMinutesRange ? Math.min(100, border.queueMinutesRange[1] * 2) : 100;
    }
    const riskScore = Math.round(
      weights.weather * weatherScore +
        weights.crowd * crowdScoreOf(crowd.level) +
        weights.disruption * disruptionScore +
        weights.transfer * transferScore +
        weights.border * borderScore,
    );
    const shiftedEtaHigh = addMinutes(baseEtaHigh, Math.max(0, offset));
    const meetsDeadline = arriveBy ? Date.parse(shiftedEtaHigh) <= Date.parse(arriveBy) : null;
    return { departAt, routeId: primary.candidate.id, riskScore, meetsDeadline };
  };
}

function capConfidenceFor(route: TeamRouteResult): Confidence {
  return route.assessment.risk.quality === "live" ? "medium" : "low";
}

/**
 * 正式決策：把 A 的核心結果轉成 `TeamDecisionResult`。
 *
 * 不變條件（有測試鎖定）：
 *   - `action === "unavailable"` ⇔ 沒有可行主路；
 *   - `primaryRouteId` / `backupRouteIds` 只引用 `eligible === true` 的路線；
 *   - 只有 `action === "go"` 才提供 `departureWindow`；
 *   - `hold` 不提供出發窗口（安全規則／趕不上期限）；
 *   - 同輸入同輸出。
 */
export async function decideTeamJourney(
  core: TeamCoreResult,
  options: DecideTeamOptions = {},
): Promise<TeamDecisionResult> {
  const notices: string[] = [];
  const views = core.routes.map(toPlanView);
  const eligible = core.routes.filter((route) => route.eligible && route.exclusions.length === 0);
  const { primary, overrodeRecommendation } = pickPrimary(eligible, core.recommendedRouteId);

  if (!primary) {
    return {
      action: "unavailable",
      primaryRouteId: null,
      backupRouteIds: [],
      departureWindow: null,
      explanations: await explainTeamDecision(core, {
        action: "unavailable",
        primaryRouteId: null,
        backupRouteIds: [],
        departureWindow: null,
        explanations: [],
        notices: [],
      }, options.explain),
      notices: ["沒有可行主路線（全部候選已被硬約束排除或缺少資料），不提供出發建議。"],
    };
  }

  if (overrodeRecommendation) {
    notices.push(
      "A 的推薦路線在保守 ETA 下趕不上到達期限，已改選其他可行路線；不採用「到達超時」的候選（D2-05）。",
    );
  }

  const severeWeather = factorScore(primary, "weather") >= SEVERE_WEATHER_HOLD_SCORE;
  const hold = (severeWeather && !railDominant(primary)) || primary.meetsDeadline === false;
  const action: TeamDecisionResult["action"] = hold ? "hold" : "go";

  if (severeWeather && !railDominant(primary)) {
    notices.push("惡劣天氣安全規則：主路以路面交通為主，建議暫緩非必要行程（保留候選供比較，不給出發時間）。");
  }
  if (primary.meetsDeadline === false) {
    notices.push("所有可行候選的保守 ETA 均超過到達期限，無法承諾準時。");
  }

  const primaryView = views.find((view) => view.routeId === primary.candidate.id)!;
  const backup = selectBackup(primaryView, views);
  if (!backup) {
    notices.push("沒有與主路真正獨立的備選方案（不同口岸／不同主要長途線路），故不提供 Plan B。");
  }

  let departureWindow: TeamDecisionResult["departureWindow"] = null;
  if (action === "go") {
    const window = searchDepartureWindow({
      from: core.request.departAt,
      horizonMinutes: 120,
      stepMinutes: 10,
      sampleRisk: makeSampler(core, primary),
    });
    if (window) {
      departureWindow = {
        start: window.start,
        end: window.end,
        confidence: capConfidenceFor(primary),
        evidence: window.evidence,
      };
    }
  }

  const partial: TeamDecisionResult = {
    action,
    primaryRouteId: primary.candidate.id,
    backupRouteIds: backup ? [backup.routeId] : [],
    departureWindow,
    explanations: [],
    notices: backup ? [...notices, backup.reason, backup.trigger] : notices,
  };

  partial.explanations = await explainTeamDecision(core, partial, options.explain);
  return partial;
}
