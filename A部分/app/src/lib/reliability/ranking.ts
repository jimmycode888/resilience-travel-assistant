/**
 * 四模式路線排序（成員 A 的核心模組）。
 *
 * 職責：把「多條候選 + 各自已算好的風險」依模式排成一份可推薦的清單。
 * 四種模式**只調時間／風險權重，不換算法**（權重表見 risk/thresholds.ts），
 * 這樣「最快 / 最穩 / 較不擠 / 均衡」的差異完全可解釋、可回測。
 *
 * 依賴方向：ranking → reliability → 型別。ranking 不自己算風險，
 * 只消費 `RankableRoute.risk`，因此風險引擎換實作時這裡完全不用改。
 *
 * ⚠️ 純函式：排序必須是決定性的，同分時有明確的次級／三級比較鍵。
 */
import { assessRouteRisk } from "@/lib/risk";
import { modeProfileOf } from "@/lib/risk/thresholds";
import type { RankableRoute, RankedRoute, RouteRanking } from "@/lib/types/reliability";
import type { RiskContext, RiskRouteSource, RouteMode } from "@/lib/types/risk";
import { assessReliability } from "./engine";

export interface RankingOptions {
  /** 排序模式；預設 "balanced"。 */
  mode?: RouteMode;
}

/**
 * 依模式排序候選路線。
 *
 * `timeScore` 用同組的 min / max 做線性內插（最快 100、最慢 0），
 * 所以它是「相對這批候選」的分數，而非絕對時間——這樣不同查詢之間不會
 * 因為行程長短差異而讓排序失真。
 */
export function rankRoutes(
  routes: readonly RankableRoute[],
  options?: RankingOptions,
): RouteRanking {
  const mode = options?.mode ?? "balanced";
  const profile = modeProfileOf(mode);

  if (routes.length === 0) {
    return {
      mode,
      ranked: [],
      recommendedRouteId: null,
      notices: ["沒有候選路線可排序。"],
    };
  }

  const durations = routes.map((entry) => entry.route.journey.totalMinutes);
  const max = Math.max(...durations);
  const min = Math.min(...durations);

  const ranked: RankedRoute[] = routes.map((entry) => {
    const reliability = assessReliability(entry.route, entry.risk, { mode });
    const durationMinutes = entry.route.journey.totalMinutes;
    // 全部同長時視為同等快（避免除以零），給滿分 100。
    const timeScore =
      max === min ? 100 : Math.round((100 * (max - durationMinutes)) / (max - min));
    const riskScore = entry.risk.score;
    const rankScore = Math.round(
      profile.timeWeight * timeScore + profile.riskWeight * (100 - riskScore),
    );

    return {
      routeId: entry.route.id,
      label: entry.route.label,
      mode,
      rankScore,
      timeScore,
      riskScore,
      durationMinutes,
      risk: entry.risk,
      reliability,
    };
  });

  // 決定性排序：rankScore 降序 → 時間升序 → routeId 升序（localeCompare）。
  ranked.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    if (a.durationMinutes !== b.durationMinutes) return a.durationMinutes - b.durationMinutes;
    return a.routeId.localeCompare(b.routeId);
  });

  return {
    mode,
    ranked,
    recommendedRouteId: ranked[0]?.routeId ?? null,
    notices: [`已依「${profile.label}」模式排序：${profile.description}`],
  };
}

/**
 * 一站式排序：對每條候選「先依模式算風險、再排序」。
 *
 * 為什麼需要這個入口：四種模式的差異其實有兩層——
 *   1. 排序時的時間／風險權重（`profile.timeWeight` / `riskWeight`）；
 *   2. 風險聚合時的**因子倍率**（例如 `less_crowded` 把 crowd 放大 2.2 倍）。
 *
 * 若只做第 1 層、風險卻用單一模式算一次，`reliable` 與 `less_crowded`
 * （兩者時間／風險權重同為 0.35 / 0.65）就會排出完全相同的結果，四模式名不副實。
 * 這個入口保證兩層都依同一個 `mode` 生效，呼叫端不必自己記得「先重算風險」。
 *
 * 依賴方向：reliability → risk（單向，見 ARCHITECTURE.md）。
 */
export function rankCandidates(
  routes: readonly RiskRouteSource[],
  context: RiskContext,
  options?: RankingOptions,
): RouteRanking {
  const mode = options?.mode ?? "balanced";
  const rankable: RankableRoute[] = routes.map((route) => ({
    route,
    risk: assessRouteRisk(route, context, { mode }),
  }));
  return rankRoutes(rankable, { mode });
}
