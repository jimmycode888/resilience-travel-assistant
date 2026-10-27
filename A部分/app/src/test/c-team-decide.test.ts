import { describe, expect, it } from 'vitest';
import { decideTeamJourney } from '@/lib/decision/team-decide';
import type { TeamCoreResult, TeamRouteResult } from '@/lib/types/team-integration';
import type { CandidateRoute } from '@/lib/types/route';
import type { JourneyMode } from '@/lib/types/journey';

const DEPART_AT = '2026-10-13T08:00:00+08:00';

interface RouteSpec {
  id: string;
  label: string;
  eligible: boolean;
  exclusions?: string[];
  meetsDeadline?: boolean | null;
  rankScore: number;
  mode?: JourneyMode;
  crossesBorder?: boolean;
  portIds?: string[];
  weatherScore?: number;
  etaHigh?: string;
}

function segment(id: string, mode: JourneyMode, minutes: number, line: string | null, crossesBorder = false, portId?: string) {
  return {
    id,
    mode,
    kind: (crossesBorder ? 'border_crossing' : 'in_hk') as 'border_crossing' | 'in_hk',
    line,
    from: { id: `${id}-f`, name: `${id}-f`, lat: 22.3, lon: 114.2, kind: 'station' as const, side: 'hk' as const, sideSource: 'registry' as const },
    to: { id: `${id}-t`, name: `${id}-t`, lat: 22.31, lon: 114.21, kind: 'station' as const, side: crossesBorder ? ('sz' as const) : ('hk' as const), sideSource: 'registry' as const },
    departAt: DEPART_AT,
    arriveAt: DEPART_AT,
    durationMinutes: minutes,
    geometry: [[114.2, 22.3], [114.21, 22.31]] as [number, number][],
    viaStations: [],
    viaDistricts: [],
    ...(portId ? { border: { portId, queueMinutesRange: [12, 28] as [number, number], confidence: 'low' as const, note: '估算' } } : {}),
  };
}

function makeRoute(spec: RouteSpec): TeamRouteResult {
  const crossesBorder = spec.crossesBorder ?? false;
  const portIds = spec.portIds ?? [];
  const journey = {
    id: spec.id,
    label: spec.label,
    segments: [
      segment(`${spec.id}-s1`, spec.mode ?? 'mtr', 25, spec.mode === 'mtr' ? '將軍澳線' : null),
      ...(crossesBorder ? [segment(`${spec.id}-b`, 'cross_border_bus', 30, null, true, portIds[0])] : []),
    ],
    departAt: DEPART_AT,
    arriveAt: spec.etaHigh ?? DEPART_AT,
    totalMinutes: 55,
    crossesBorder,
    borderPortIds: portIds,
  };
  const candidate = { id: spec.id, label: spec.label, provider: 'corridor', quality: 'fixture', journey } as unknown as CandidateRoute;
  const weatherScore = spec.weatherScore ?? 10;
  const risk = {
    routeId: spec.id, label: spec.label, mode: 'balanced', crossesBorder, score: 40, level: 'medium',
    breakdown: {
      weather: weatherScore, crowd: 15, disruption: 0, transfer: 5, border: crossesBorder ? 40 : 0, overall: 40,
      weights: crossesBorder
        ? { weather: 0.15, crowd: 0.2, disruption: 0.25, transfer: 0.1, border: 0.3 }
        : { weather: 0.25, crowd: 0.25, disruption: 0.35, transfer: 0.15, border: 0 },
      factors: [
        { id: 'weather', score: weatherScore, level: 'low', weight: 0.25, contribution: weatherScore * 0.25, claim: '天氣風險', evidence: '', source: 'x', sourceUrl: null },
        { id: 'crowd', score: 15, level: 'low', weight: 0.25, contribution: 3, claim: '人流風險', evidence: '', source: 'x', sourceUrl: null },
      ],
      confidence: 'low',
    },
    quality: 'fixture', notices: [],
  };
  const reliability = {
    routeId: spec.id, label: spec.label, mode: 'balanced', onTimeConfidence: 'low' as const,
    confidenceNote: '未經歷史校準。', etaRange: [DEPART_AT, spec.etaHigh ?? DEPART_AT] as [string, string],
    riskLevel: 'medium' as const, ruleScore: 70, factors: [], quality: 'fixture' as const, notices: [],
  };
  return {
    candidate,
    assessment: { routeId: spec.id, label: spec.label, mode: 'balanced', rankScore: spec.rankScore, timeScore: 80, riskScore: 40, durationMinutes: 55, risk, reliability },
    eligible: spec.eligible,
    exclusions: spec.exclusions ?? (spec.eligible ? [] : ['被排除']),
    meetsDeadline: spec.meetsDeadline ?? true,
    data: null,
  } as unknown as TeamRouteResult;
}

function makeCore(routes: RouteSpec[], recommendedRouteId: string | null, arriveBy?: string): TeamCoreResult {
  return {
    request: { origin: 'a', destination: 'b', departAt: DEPART_AT, mode: 'balanced', ...(arriveBy ? { arriveBy } : {}) },
    evaluatedAt: DEPART_AT,
    routes: routes.map(makeRoute),
    recommendedRouteId,
    notices: [],
  };
}

describe('C 正式決策入口 decideTeamJourney', () => {
  it('正常：go + 主路 + 獨立備選 + 出發窗口', async () => {
    const core = makeCore(
      [
        { id: 'R1', label: 'R1', eligible: true, rankScore: 90, etaHigh: '2026-10-13T10:00:00+08:00' },
        { id: 'R2', label: 'R2', eligible: true, rankScore: 80, mode: 'bus', etaHigh: '2026-10-13T10:20:00+08:00' },
      ],
      'R1',
      '2026-10-13T11:00:00+08:00',
    );
    const decision = await decideTeamJourney(core);
    expect(decision.action).toBe('go');
    expect(decision.primaryRouteId).toBe('R1');
    expect(decision.backupRouteIds).toEqual(['R2']);
    expect(decision.departureWindow).not.toBeNull();
    expect(Date.parse(decision.departureWindow!.start)).toBeGreaterThanOrEqual(Date.parse(DEPART_AT));
    expect(decision.explanations.length).toBeGreaterThan(0);
  });

  it('沒有可行主路 → unavailable，且不提供出發窗口／備選', async () => {
    const core = makeCore([{ id: 'R1', label: 'R1', eligible: false, rankScore: 10 }], null);
    const decision = await decideTeamJourney(core);
    expect(decision.action).toBe('unavailable');
    expect(decision.primaryRouteId).toBeNull();
    expect(decision.backupRouteIds).toEqual([]);
    expect(decision.departureWindow).toBeNull();
  });

  it('不得升用被排除的路線（即使 A 的推薦指向它）', async () => {
    const core = makeCore(
      [
        { id: 'BAD', label: 'BAD', eligible: false, rankScore: 99 },
        { id: 'OK', label: 'OK', eligible: true, rankScore: 50, etaHigh: '2026-10-13T10:00:00+08:00' },
      ],
      'BAD',
      '2026-10-13T11:00:00+08:00',
    );
    const decision = await decideTeamJourney(core);
    expect(decision.primaryRouteId).toBe('OK');
    expect(decision.primaryRouteId).not.toBe('BAD');
  });

  it('惡劣天氣 + 路面主路 → hold 且無出發窗口', async () => {
    const core = makeCore(
      [
        { id: 'BUS', label: '跨境巴士', eligible: true, rankScore: 90, mode: 'cross_border_bus', crossesBorder: true, portIds: ['shenzhen-bay'], weatherScore: 85, etaHigh: '2026-10-13T10:00:00+08:00' },
        { id: 'XR', label: '另一口岸', eligible: true, rankScore: 60, mode: 'cross_border_bus', crossesBorder: true, portIds: ['lok-ma-chau'], etaHigh: '2026-10-13T10:30:00+08:00' },
      ],
      'BUS',
      '2026-10-13T12:00:00+08:00',
    );
    const decision = await decideTeamJourney(core);
    expect(decision.action).toBe('hold');
    expect(decision.departureWindow).toBeNull();
    expect(decision.notices.join(' ')).toContain('惡劣天氣安全規則');
  });

  it('惡劣天氣但主路以鐵路為主 → 不觸發 hold（室內候車）', async () => {
    const core = makeCore(
      [{ id: 'MTR', label: '港鐵方案', eligible: true, rankScore: 90, mode: 'mtr', weatherScore: 85, etaHigh: '2026-10-13T10:00:00+08:00' }],
      'MTR',
      '2026-10-13T11:00:00+08:00',
    );
    const decision = await decideTeamJourney(core);
    expect(decision.action).toBe('go');
    expect(decision.departureWindow).not.toBeNull();
  });

  it('主路趕不上期限 → hold', async () => {
    const core = makeCore(
      [{ id: 'R1', label: 'R1', eligible: true, rankScore: 90, meetsDeadline: false, etaHigh: '2026-10-13T12:00:00+08:00' }],
      'R1',
      '2026-10-13T11:00:00+08:00',
    );
    const decision = await decideTeamJourney(core);
    expect(decision.action).toBe('hold');
    expect(decision.departureWindow).toBeNull();
  });

  it('A 推薦的路線趕不上期限 → 改選其他可行路線，不採用超時候選（D2-05）', async () => {
    const core = makeCore(
      [
        { id: 'LATE', label: '超時路線', eligible: true, rankScore: 99, meetsDeadline: false, etaHigh: '2026-10-13T12:00:00+08:00' },
        { id: 'OK', label: '可行路線', eligible: true, rankScore: 50, etaHigh: '2026-10-13T10:00:00+08:00' },
      ],
      'LATE',
      '2026-10-13T11:00:00+08:00',
    );
    const decision = await decideTeamJourney(core);
    expect(decision.primaryRouteId).toBe('OK');
    expect(decision.action).toBe('go');
    expect(decision.notices.join(' ')).toContain('D2-05');
  });

  it('同輸入同輸出（決定性）', async () => {
    const core = makeCore(
      [
        { id: 'R1', label: 'R1', eligible: true, rankScore: 90, etaHigh: '2026-10-13T10:00:00+08:00' },
        { id: 'R2', label: 'R2', eligible: true, rankScore: 80, mode: 'bus', etaHigh: '2026-10-13T10:20:00+08:00' },
      ],
      'R1',
      '2026-10-13T11:00:00+08:00',
    );
    const first = await decideTeamJourney(core);
    const second = await decideTeamJourney(core);
    expect(second).toEqual(first);
  });
});
