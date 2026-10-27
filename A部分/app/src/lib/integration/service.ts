import { findPort, isPortOpen } from '@/lib/geo/ports';
import { assessRouteRisk } from '@/lib/risk/engine';
import { rankRoutes } from '@/lib/reliability/ranking';
import { addMinutes, parseArriveBy } from '@/lib/time';
import type { RiskContext } from '@/lib/types/risk';
import type { RouteQuality } from '@/lib/types/route';
import type { TeamJourneyModules, TeamJourneyRequest, TeamJourneyResult, TeamCoreResult } from '@/lib/types/team-integration';

const order: RouteQuality[] = ['fixture', 'cached', 'live'];
function worst(...values: RouteQuality[]): RouteQuality { return order[Math.min(...values.map(value => order.indexOf(value)))] ?? 'fixture'; }

/** Server-side composition boundary. Inject actual B/C modules without editing A's algorithms. */
export function createTeamJourneyService(modules: TeamJourneyModules) {
  return async function evaluate(request: TeamJourneyRequest, evaluatedAt: string): Promise<TeamJourneyResult> {
    const departure = parseArriveBy(request.departAt);
    const now = parseArriveBy(evaluatedAt);
    const deadline = request.arriveBy ? parseArriveBy(request.arriveBy) : null;
    if (!departure.ok || !now.ok || (deadline && !deadline.ok)) throw new Error('行程與評估時間必須有效。');
    if (deadline?.ok && deadline.epochMs <= departure.epochMs) throw new Error('到達期限必須晚於出發時間。');
    const normalized = { ...request, departAt: departure.iso, arriveBy: deadline?.ok ? deadline.iso : undefined };
    const resolution = await modules.resolveCandidates(normalized);
    const notices = [...resolution.notices];
    const ids = resolution.candidates.map(route => route.id);
    if (new Set(ids).size !== ids.length) throw new Error('候選路線 ID 不得重複。');
    const entries = await Promise.all(resolution.candidates.map(async original => {
      const data = await modules.resolveRouteData(original, normalized);
      if (data && data.routeId !== original.id) throw new Error(`資料路線 ID 不匹配：${original.id}。`);
      const stale = data && (!Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= now.epochMs || !Number.isFinite(Date.parse(data.updatedAt)) || Date.parse(data.updatedAt) > now.epochMs);
      const quality = worst(original.quality, data?.quality ?? 'fixture', data?.value.quality ?? 'fixture', stale ? 'cached' : 'live');
      const route = { ...original, quality };
      const context: RiskContext = data ? { ...data.value, quality } : { quality, weather: null, service: null, crowd: null, incidents: [] };
      if (!data) notices.push(`${route.id} 缺少情境資料，採保守風險與低信心。`);
      if (stale) notices.push(`${route.id} 情境資料已過期或時間無效，已降低品質與信心。`);
      const exclusions: string[] = [];
      if (context.service?.status === 'disrupted') exclusions.push('對應服務中斷。');
      for (const segment of route.journey.segments.filter(s => s.kind === 'border_crossing')) {
        const portId = segment.border?.portId;
        const port = portId ? findPort(portId) : undefined;
        const injected = context.border?.portId === portId ? context.border : undefined;
        const queue = injected?.queueMinutesRange ?? segment.border?.queueMinutesRange;
        if (!port) exclusions.push('缺少可識別口岸。');
        else if (!isPortOpen(port, segment.departAt) || !isPortOpen(port, addMinutes(segment.arriveAt, queue?.[1] ?? 0))) exclusions.push(`${port.name}預計通關時未開放。`);
      }
      const risk = assessRouteRisk(route, context, { mode: normalized.mode });
      if (!data || stale || data.confidence === 'low') risk.breakdown.confidence = 'low';
      else if (data.confidence === 'medium' && risk.breakdown.confidence === 'high') risk.breakdown.confidence = 'medium';
      return { route, risk, exclusions, data, context, lowConfidence: !data || stale || data.confidence === 'low' };
    }));
    const ranked = rankRoutes(entries.filter(entry => !entry.exclusions.length), { mode: normalized.mode });
    const rejected = rankRoutes(entries.filter(entry => entry.exclusions.length), { mode: normalized.mode });
    const routes = [...ranked.ranked, ...rejected.ranked].map(originalAssessment => {
      const entry = entries.find(item => item.route.id === originalAssessment.routeId)!;
      const queues = entry.route.journey.segments.flatMap(s => {
        if (s.kind !== 'border_crossing') return [];
        const injected = entry.context.border?.portId === s.border?.portId ? entry.context.border : undefined;
        return injected ? [injected.queueMinutesRange] : s.border ? [s.border.queueMinutesRange] : [];
      });
      const reliability = { ...originalAssessment.reliability, etaRange: [addMinutes(originalAssessment.reliability.etaRange[0], queues.reduce((sum, q) => sum + q[0], 0)), addMinutes(originalAssessment.reliability.etaRange[1], queues.reduce((sum, q) => sum + q[1], 0))] as [string, string] };
      if (entry.lowConfidence) reliability.onTimeConfidence = 'low';
      else if (entry.data?.confidence === 'medium' && reliability.onTimeConfidence === 'high') reliability.onTimeConfidence = 'medium';
      const assessment = { ...originalAssessment, reliability };
      return { candidate: entry.route, assessment, eligible: !entry.exclusions.length, exclusions: entry.exclusions, meetsDeadline: deadline?.ok ? Date.parse(reliability.etaRange[1]) <= deadline.epochMs : null, data: entry.data };
    });
    const recommended = routes.find(route => route.eligible && route.meetsDeadline !== false) ?? routes.find(route => route.eligible);
    const hold = entries.some(entry => /黑色暴雨|八號|九號|十號/.test(entry.context.weather?.warning ?? ''));
    const core: TeamCoreResult = { request: normalized, evaluatedAt: now.iso, routes, recommendedRouteId: hold ? null : recommended?.candidate.id ?? null, notices };
    if (hold) core.notices.push('嚴重天氣警告：暫緩非必要行程。');
    const decision = modules.decide ? await modules.decide(core) : null;
    if (decision) {
      const allowed = new Set(routes.filter(route => route.eligible).map(route => route.candidate.id));
      if ([decision.primaryRouteId, ...decision.backupRouteIds].some(id => id !== null && !allowed.has(id))) throw new Error('C 決策引用不存在或已被 A 排除的路線。');
      if (hold && (decision.action !== 'hold' || decision.primaryRouteId || decision.backupRouteIds.length || decision.departureWindow)) throw new Error('嚴重天氣暫緩狀態不得被決策覆寫。');
      if (decision.action === 'go' && !decision.primaryRouteId) throw new Error('go 決策必須有可行主路線。');
      if (decision.departureWindow) {
        const start = parseArriveBy(decision.departureWindow.start); const end = parseArriveBy(decision.departureWindow.end);
        if (!start.ok || !end.ok || end.epochMs < start.epochMs || start.epochMs < departure.epochMs) throw new Error('出發窗口時間無效。');
      }
    }
    return { ...core, decision };
  };
}
