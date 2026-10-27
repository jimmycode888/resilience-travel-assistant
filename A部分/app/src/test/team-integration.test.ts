import { describe, expect, it } from 'vitest';
import { createTeamJourneyService } from '@/lib/integration';
import { resolveRoutes } from '@/lib/route/adapter';
import type { TeamJourneyModules, TeamJourneyRequest, RouteDataEnvelope } from '@/lib/types/team-integration';
const request: TeamJourneyRequest = { origin: 'central-exchange-square', destination: 'futian-station-sz', departAt: '2026-10-13T08:00:00+08:00', mode: 'balanced' };
const now = '2026-10-13T07:59:00+08:00';
function modules(): TeamJourneyModules {
  return {
    resolveCandidates: async query => (await resolveRoutes({ query, providers: [] })).resolution,
    resolveRouteData: async route => ({ routeId: route.id, value: { quality: 'live', weather: { condition: 'clear', warning: null, updatedAt: now }, service: { status: 'ok', delayMinutes: 0, crowding: 'low' } }, source: 'B 測試資料', sourceUrl: null, updatedAt: now, expiresAt: '2026-10-13T08:05:00+08:00', confidence: 'high', quality: 'live' }),
  };
}
describe('A 對 B/C/D 的可插拔接口', () => {
  it('B 注入資料，A 返回可供 D 繪製的候選、風險、可靠性與排序', async () => {
    const result = await createTeamJourneyService(modules())(request, now);
    expect(result.routes).toHaveLength(3);
    expect(result.recommendedRouteId).not.toBeNull();
    expect(result.decision).toBeNull();
    expect(result.routes.every(route => route.candidate.quality === 'fixture')).toBe(true);
    expect(result.routes.every(route => route.data?.source === 'B 測試資料')).toBe(true);
  });
  it('資料缺失保守降級，來源過期信心降低', async () => {
    const deps = modules(); deps.resolveRouteData = async () => null;
    const result = await createTeamJourneyService(deps)(request, now);
    expect(result.routes.every(route => route.assessment.reliability.onTimeConfidence === 'low')).toBe(true);
    const staleDeps = modules(); const load = staleDeps.resolveRouteData;
    staleDeps.resolveRouteData = async (route, input) => ({ ...(await load(route, input))!, expiresAt: now });
    const stale = await createTeamJourneyService(staleDeps)(request, now);
    expect(stale.notices.some(text => text.includes('過期'))).toBe(true);
  });
  it('拒絕把另一條路線的服務訊號套進來', async () => {
    const deps = modules(); const load = deps.resolveRouteData;
    deps.resolveRouteData = async (route, input) => ({ ...(await load(route, input))!, routeId: 'R1' });
    await expect(createTeamJourneyService(deps)(request, now)).rejects.toThrow('ID 不匹配');
  });
  it('C 消費 A 的排序並給出主路線、解釋與出發窗口', async () => {
    const deps = modules();
    deps.decide = async core => ({ action: 'go', primaryRouteId: core.recommendedRouteId, backupRouteIds: [], departureWindow: { start: request.departAt, end: '2026-10-13T08:10:00+08:00', confidence: 'low', evidence: 'C 測試規則' }, explanations: [{ routeId: core.recommendedRouteId!, text: '候選比較', evidence: ['風險與 ETA'] }], notices: [] });
    const result = await createTeamJourneyService(deps)(request, now);
    expect(result.decision?.primaryRouteId).toBe(result.recommendedRouteId);
  });
  it('中斷硬約束不得被 C 覆寫', async () => {
    const deps = modules(); const load = deps.resolveRouteData;
    deps.resolveRouteData = async (route, input) => {
      const data = (await load(route, input))!;
      if (route.id === 'xb-1-lok-ma-chau') data.value.service!.status = 'disrupted';
      return data;
    };
    deps.decide = async () => ({ action: 'go', primaryRouteId: 'xb-1-lok-ma-chau', backupRouteIds: [], departureWindow: null, explanations: [], notices: [] });
    await expect(createTeamJourneyService(deps)(request, now)).rejects.toThrow('已被 A 排除');
  });
  it('嚴重天氣禁止 C 給出 go', async () => {
    const deps = modules(); const load = deps.resolveRouteData;
    deps.resolveRouteData = async (route, input): Promise<RouteDataEnvelope> => { const data = (await load(route, input))!; data.value.weather!.warning = '黑色暴雨警告信號'; return data; };
    deps.decide = async () => ({ action: 'go', primaryRouteId: 'xb-1-lok-ma-chau', backupRouteIds: [], departureWindow: null, explanations: [], notices: [] });
    await expect(createTeamJourneyService(deps)(request, now)).rejects.toThrow('不得被決策覆寫');
  });
  it('深夜已關閉口岸不能進主推薦', async () => {
    const result = await createTeamJourneyService(modules())({ ...request, departAt: '2026-10-13T23:00:00+08:00' }, now);
    expect(result.recommendedRouteId).toBeNull();
    expect(result.routes.every(route => !route.eligible)).toBe(true);
  });
});
