import { describe, expect, it, vi } from 'vitest';
import {
  buildTemplateExplanation,
  explainRoute,
  parseTravelRequest,
  validateExplanation,
} from '@/lib/ai';
import type { TeamRouteResult } from '@/lib/types/team-integration';
import type { ReliabilityResult } from '@/lib/types/reliability';
import type { RouteRisk } from '@/lib/types/risk';
import type { CandidateRoute } from '@/lib/types/route';

function route(): TeamRouteResult {
  const candidate = {
    id: 'R1',
    label: '坑口 → 中環（經北角）',
    provider: 'corridor',
    quality: 'fixture',
    journey: {
      id: 'R1',
      label: '坑口 → 中環（經北角）',
      segments: [
        {
          id: 's1',
          mode: 'mtr',
          kind: 'in_hk',
          line: '將軍澳線',
          from: { id: 'a', name: '坑口', lat: 22.31, lon: 114.26, kind: 'station', side: 'hk', sideSource: 'registry' },
          to: { id: 'b', name: '北角', lat: 22.29, lon: 114.2, kind: 'station', side: 'hk', sideSource: 'registry' },
          departAt: '2026-10-13T08:00:00+08:00',
          arriveAt: '2026-10-13T08:20:00+08:00',
          durationMinutes: 20,
          geometry: [[114.26, 22.31], [114.2, 22.29]],
          viaStations: ['北角'],
          viaDistricts: [],
        },
      ],
      departAt: '2026-10-13T08:00:00+08:00',
      arriveAt: '2026-10-13T08:20:00+08:00',
      totalMinutes: 20,
      crossesBorder: false,
      borderPortIds: [],
    },
  } as unknown as CandidateRoute;
  const reliability: ReliabilityResult = {
    routeId: 'R1',
    label: candidate.label,
    mode: 'balanced',
    onTimeConfidence: 'high',
    confidenceNote: '未經歷史校準，這是定性信心。',
    etaRange: ['2026-10-13T08:20:00+08:00', '2026-10-13T08:30:00+08:00'],
    riskLevel: 'low',
    ruleScore: 88,
    factors: [],
    quality: 'fixture',
    notices: [],
  };
  const risk = {
    routeId: 'R1',
    label: candidate.label,
    mode: 'balanced',
    crossesBorder: false,
    score: 30,
    level: 'low',
    breakdown: {
      weather: 10, crowd: 15, disruption: 0, transfer: 5, border: 0, overall: 30,
      weights: { weather: 0.25, crowd: 0.25, disruption: 0.35, transfer: 0.15, border: 0 },
      factors: [
        { id: 'disruption', score: 0, level: 'low', weight: 0.35, contribution: 0, claim: '服務正常', evidence: '', source: 'x', sourceUrl: null },
      ],
      confidence: 'low',
    },
    quality: 'fixture',
    notices: [],
  } as unknown as RouteRisk;
  return { candidate, assessment: { routeId: 'R1', label: candidate.label, mode: 'balanced', rankScore: 80, timeScore: 90, riskScore: 30, durationMinutes: 20, risk, reliability }, eligible: true, exclusions: [], meetsDeadline: true, data: null };
}

describe('C5 · 自然語言解析（只產生條件，不決定路線）', () => {
  it('解析目的地、期限與人流偏好', () => {
    const parsed = parseTravelRequest('我要晚上七点前到福田，我不想太挤。');
    expect(parsed.destinationId).toBe('futian-station-sz');
    expect(parsed.arriveBy).toBe('19:00');
    expect(parsed.crowdPreference).toBe('low');
  });

  it('沒有提及期限與偏好時如實留空', () => {
    const parsed = parseTravelRequest('去中環站');
    expect(parsed.destinationId).toBe('central-station');
    expect(parsed.arriveBy).toBeNull();
    expect(parsed.crowdPreference).toBe('any');
  });

  it('解析結果不含任何路線選擇欄位', () => {
    const parsed = parseTravelRequest('七點前到福田');
    expect(Object.keys(parsed)).not.toContain('routeId');
    expect(Object.keys(parsed)).not.toContain('action');
  });
});

describe('C5 · 解釋層（模板 + 白名單 + 降級）', () => {
  it('無模型時使用模板，且模板只含事實', async () => {
    const result = await explainRoute(route());
    expect(result.source).toBe('template');
    expect(result.text).toContain('未經歷史校準');
  });

  it('模型輸出含未在事實中的時刻 → 整段退回模板', async () => {
    const model = vi.fn(() => '建議 09:99 出發（憑空捏造）');
    const result = await explainRoute(route(), { model });
    expect(result.source).toBe('template');
    expect(result.reason).toBe('unsupported-fact');
  });

  it('模型輸出引用不存在的事實時刻 → 拒絕；引用存在時刻 → 接受', async () => {
    const facts = ['預計到達 08:20–08:30'];
    expect(validateExplanation('請在 08:25 前後留意', facts)).toBe(true);
    expect(validateExplanation('請在 07:00 出發', facts)).toBe(false);
    expect(validateExplanation('改乘 R9 路線', facts)).toBe(false);
  });

  it('模型拋錯或逾時 → 回退模板，功能不失效', async () => {
    const throwing = vi.fn(() => { throw new Error('boom'); });
    expect((await explainRoute(route(), { model: throwing })).source).toBe('template');
    const slow = vi.fn(() => new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 50)));
    expect((await explainRoute(route(), { model: slow, timeoutMs: 5 })).source).toBe('template');
  });

  it('模板永不修改任何決策欄位（只回傳字串）', async () => {
    const r = route();
    const before = JSON.stringify(r);
    await explainRoute(r);
    expect(JSON.stringify(r)).toBe(before);
    expect(buildTemplateExplanation(['a', 'b'])).toContain('a；b');
  });
});
