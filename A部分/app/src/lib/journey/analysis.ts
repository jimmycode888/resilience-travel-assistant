import { findPort, isPortOpen } from '@/lib/geo/ports';
import { hkMinutesOfDay, addMinutes } from '@/lib/time';
import { assessRouteRisk } from '@/lib/risk/engine';
import { rankRoutes } from '@/lib/reliability/ranking';
import { createFixtureProvider } from '@/lib/route/providers/fixture';
import { parseRawJourney } from '@/lib/route/parse';
import type { CandidateRoute } from '@/lib/types/route';
import type { CrowdSignal, RiskContext } from '@/lib/types/risk';
import type { JourneyAnalysis, JourneyAnalysisRequest, AnalyzedJourney, DepartureOption } from '@/lib/types/journey-analysis';

/** A transparent demonstration heuristic; no historical training data or live headcount. */
export function estimateCrowd(route: CandidateRoute, scenario: JourneyAnalysisRequest['scenario']): CrowdSignal {
  const minute = hkMinutesOfDay(route.journey.departAt);
  const peak = (minute >= 450 && minute < 570) || (minute >= 1020 && minute < 1170);
  const eastRail = route.journey.segments.some(s => s.line === '東鐵線');
  const interrupted = scenario === 'disruption' && eastRail;
  const level = interrupted ? 'critical' : peak ? 'high' : route.journey.crossesBorder ? 'medium' : 'low';
  return { level, confidence: 'low', evidence: `演示規則：香港時間 07:30–09:30 / 17:00–19:30 為假設高峰；跨境平峰中等；東鐵中斷情景提高人流風險。未使用歷史客流或即時人數。` };
}

function contextFor(route: CandidateRoute, request: JourneyAnalysisRequest): RiskContext {
  const interrupted = request.scenario === 'disruption' && route.journey.segments.some(s => s.line === '東鐵線');
  return {
    quality: 'fixture',
    weather: { condition: request.scenario === 'heavy_rain' ? 'heavy_rain' : 'cloudy', warning: request.scenario === 'heavy_rain' ? '黑色暴雨警告信號（演示）' : null, updatedAt: request.departAt },
    service: { status: interrupted ? 'disrupted' : 'ok', delayMinutes: interrupted ? 20 : 0, crowding: 'unknown', updatedAt: request.departAt },
    crowd: estimateCrowd(route, request.scenario),
    incidents: [],
  };
}

function exclusionsFor(route: CandidateRoute, request: JourneyAnalysisRequest): string[] {
  const exclusions: string[] = [];
  if (request.scenario === 'disruption' && route.journey.segments.some(s => s.line === '東鐵線')) exclusions.push('演示情景：東鐵線中斷。');
  for (const segment of route.journey.segments.filter(s => s.kind === 'border_crossing')) {
    const id = segment.border?.portId;
    const port = id ? findPort(id) : undefined;
    if (!port) { exclusions.push('缺少可核對的口岸，不能確認可行性。'); continue; }
    const queue = segment.border?.queueMinutesRange[1] ?? 0;
    // Check both entry and completion, including queue allowance; departure alone is insufficient.
    if (!isPortOpen(port, segment.departAt) || !isPortOpen(port, addMinutes(segment.arriveAt, queue))) exclusions.push(`${port.name}在預計通關時段未開放（按參考時間表）。`);
  }
  return exclusions;
}

export function evaluate(candidates: CandidateRoute[], request: JourneyAnalysisRequest, queueIncluded = false): AnalyzedJourney[] {
  const entries = candidates.map(route => ({ route, risk: assessRouteRisk(route, contextFor(route, request), { mode: request.mode }) }));
  const exclusions = new Map(candidates.map(route => [route.id, exclusionsFor(route, request)]));
  // Hard constraints first; unavailable routes cannot distort normalization or win ranking.
  const eligible = entries.filter(entry => exclusions.get(entry.route.id)?.length === 0);
  const ranking = rankRoutes(eligible, { mode: request.mode });
  const rejected = rankRoutes(entries.filter(entry => exclusions.get(entry.route.id)?.length), { mode: request.mode });
  return [...ranking.ranked, ...rejected.ranked].map(assessment => {
    const candidate = candidates.find(route => route.id === assessment.routeId)!;
    // Queue is an extra waiting allowance, separate from the supplier's crossing duration.
    const queues = candidate.journey.segments.flatMap(s => s.border ? [s.border.queueMinutesRange] : []);
    const low = queueIncluded ? 0 : queues.reduce((sum, q) => sum + q[0], 0);
    const high = queueIncluded ? 0 : queues.reduce((sum, q) => sum + q[1], 0);
    const reliability = { ...assessment.reliability, etaRange: [addMinutes(assessment.reliability.etaRange[0], low), addMinutes(assessment.reliability.etaRange[1], high)] as [string, string] };
    const meetsDeadline = request.arriveBy ? Date.parse(reliability.etaRange[1]) <= Date.parse(request.arriveBy) : null;
    const factors = [...assessment.risk.breakdown.factors].sort((a, b) => b.contribution - a.contribution).slice(0, 2);
    return { candidate, assessment: { ...assessment, reliability }, crowd: estimateCrowd(candidate, request.scenario), eligible: exclusions.get(candidate.id)!.length === 0, exclusions: exclusions.get(candidate.id)!, meetsDeadline,
      explanation: `${candidate.label}：${factors.map(f => f.claim).join('；')}。${queueIncluded ? '時間已包含通關保守預留；交通為參考方案，風險非即時。' : '到達時間已另加通關排隊區間；資料為演示估算。'}` };
  });
}

async function candidatesAt(request: JourneyAnalysisRequest): Promise<CandidateRoute[]> {
  const raw = await createFixtureProvider().fetch(request, new AbortController().signal);
  return (raw ?? []).map(item => { const parsed = parseRawJourney(item.journey); return { id: parsed.journey.id, label: parsed.journey.label, provider: item.provider, quality: item.quality, journey: parsed.journey }; });
}

function choose(routes: AnalyzedJourney[]): AnalyzedJourney | undefined {
  const eligible = routes.filter(route => route.eligible);
  return eligible.find(route => route.meetsDeadline !== false) ?? eligible[0];
}

/** Standalone offline chain. Deliberately never maps phase-one R1/R2 statuses to unrelated XB routes. */
export async function analyzeJourney(request: JourneyAnalysisRequest): Promise<JourneyAnalysis> {
  const candidates = await candidatesAt(request);
  const routes = evaluate(candidates, request);
  const primary = choose(routes);
  const hold = request.scenario === 'heavy_rain';
  const departureOptions: DepartureOption[] = [];
  for (let offset = 0; offset <= 120; offset += 10) {
    const shifted = { ...request, departAt: addMinutes(request.departAt, offset) };
    const assessed = offset === 0 ? routes : evaluate(await candidatesAt(shifted), shifted);
    const preferred = hold ? undefined : choose(assessed);
    departureOptions.push({ departAt: shifted.departAt, routeId: preferred?.candidate.id ?? null, riskScore: preferred?.assessment.riskScore ?? null, etaRange: preferred?.assessment.reliability.etaRange ?? null, meetsDeadline: preferred?.meetsDeadline ?? null });
  }
  const bestDeparture = departureOptions.filter(option => option.routeId && option.meetsDeadline !== false).sort((a, b) => a.riskScore! - b.riskScore! || Date.parse(a.departAt) - Date.parse(b.departAt))[0] ?? null;
  const primaryTrunks = primary?.candidate.journey.segments.filter(s => s.mode !== 'walk' && s.durationMinutes >= 20).map(s => s.line) ?? [];
  const backup = primary ? routes.find(route => route.eligible && route.candidate.id !== primary.candidate.id && !route.candidate.journey.borderPortIds.some(id => primary.candidate.journey.borderPortIds.includes(id)) && !route.candidate.journey.segments.some(s => s.line && primaryTrunks.includes(s.line))) : undefined;
  const notices = ['全部服務狀態、客流及排隊為演示假設，並非即時資料；座標仍待官方核實。', '出發窗口只按固定情景與時段規則比較，不預測天氣轉好或中斷恢復。', '通關時間表不代表列車／巴士有班次；出行前需核對交通服務及臨時口岸安排。'];
  if (!candidates.length) notices.push('地點已確認，但這組地址尚未接入公共交通路線；請使用外部地圖規劃，或試用已有示範行程。');
  if (primary?.meetsDeadline === false) notices.push('所有可行候選的保守 ETA 均超過到達期限，無法承諾準時。');
  if (hold) notices.push('黑雨演示情景：暫緩非必要行程；以下路線僅供比較，沒有出發或切換建議。');
  return { request, routes, recommendedRouteId: hold ? null : primary?.candidate.id ?? null, action: hold ? 'hold' : primary ? 'go' : 'unavailable', departureOptions, bestDeparture, planB: !hold && backup ? { routeId: backup.candidate.id, trigger: '主路線中斷、口岸關閉或排隊超出估算上限時，重新核實再切換。', reason: `改用${backup.candidate.label}，避開主路線口岸；${backup.meetsDeadline === false ? '此備選可能趕不上期限。' : '班次仍需另行核實。'}` } : null, notices, quality: 'fixture', sources: [
    { label: '離線走廊與演示規則', url: null, updatedAt: request.departAt, note: '固定模板，非資料取得時間；來源版本 2026-10-10。' },
    { label: '入境事務處：管制站開放時間', url: 'https://www.immd.gov.hk/eng/contactus/control_points.html', updatedAt: '2026-10-10T00:00:00+08:00', note: '參考公開正常開放時間；座標與臨時安排未核實。' },
  ] };
}
