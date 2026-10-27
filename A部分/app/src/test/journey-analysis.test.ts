import { describe, expect, it } from 'vitest';
import { analyzeJourney } from '@/lib/journey/analysis';
import { handleJourneyRequest } from '@/lib/api/journey-handler';
import type { JourneyAnalysisRequest } from '@/lib/types/journey-analysis';
import { createFixtureProvider } from '@/lib/route/providers/fixture';
import { parseRawJourney } from '@/lib/route/parse';
const request: JourneyAnalysisRequest = { origin: 'central-exchange-square', destination: 'futian-station-sz', departAt: '2026-10-13T08:00:00+08:00', mode: 'balanced', scenario: 'normal' };
describe('第二階段行程鏈路', () => {
  it('離線取得三個口岸方案、溯源風險與可行備選', async () => {
    const result = await analyzeJourney(request);
    expect(result.routes).toHaveLength(3);
    expect(result.quality).toBe('fixture');
    expect(result.recommendedRouteId).not.toBeNull();
    expect(result.planB?.routeId).toBe('xb-3-shenzhen-bay');
    expect(result.routes.every(r => r.assessment.risk.breakdown.factors.length === 5)).toBe(true);
    expect(result.routes.every(r => r.candidate.quality === 'fixture')).toBe(true);
  });
  it('同一輸入完全可重現，13 個出發時點', async () => {
    const a = await analyzeJourney(request);
    expect(await analyzeJourney(request)).toEqual(a);
    expect(a.departureOptions).toHaveLength(13);
  });
  it('使用查詢的出發日期與時間，不鎖死在 08:00', async () => {
    const departAt = '2026-10-14T18:10:00+08:00';
    const result = await analyzeJourney({ ...request, departAt });
    expect(result.routes.every(r => r.candidate.journey.departAt === departAt)).toBe(true);
    expect(result.departureOptions[12]?.departAt).toBe('2026-10-14T20:10:00+08:00');
  });
  it('東鐵中斷排除落馬洲和羅湖，改走巴士口岸', async () => {
    const result = await analyzeJourney({ ...request, scenario: 'disruption' });
    expect(result.recommendedRouteId).toBe('xb-3-shenzhen-bay');
    expect(result.routes.filter(r => r.eligible)).toHaveLength(1);
    expect(result.planB).toBeNull();
  });
  it('黑雨暫緩，不提供出發或切換建議', async () => {
    const result = await analyzeJourney({ ...request, scenario: 'heavy_rain' });
    expect(result.action).toBe('hold');
    expect(result.bestDeparture).toBeNull();
    expect(result.recommendedRouteId).toBeNull();
    expect(result.planB).toBeNull();
    expect(result.routes).toHaveLength(3);
  });
  it('深夜不推薦已關閉口岸或跨過午夜的通關', async () => {
    const result = await analyzeJourney({ ...request, departAt: '2026-10-13T23:00:00+08:00' });
    expect(result.recommendedRouteId).toBeNull();
    expect(result.action).toBe('unavailable');
    expect(result.routes.every(r => !r.eligible)).toBe(true);
  });
  it('出發時關閉但抵達通關時已開放，不誤排除', async () => {
    const result = await analyzeJourney({ ...request, departAt: '2026-10-13T06:00:00+08:00' });
    expect(result.routes.find(r => r.candidate.id === 'xb-1-lok-ma-chau')?.eligible).toBe(true);
  });
  it('出發時開放但預計抵達／排隊結束已關閉，必須排除', async () => {
    const result = await analyzeJourney({ ...request, departAt: '2026-10-13T22:00:00+08:00' });
    expect(result.routes.find(r => r.candidate.id === 'xb-1-lok-ma-chau')?.eligible).toBe(false);
    expect(result.recommendedRouteId).not.toBe('xb-1-lok-ma-chau');
  });
  it('ETA 納入排隊區間，趕不上期限時不給出合格出發時點', async () => {
    const result = await analyzeJourney({ ...request, arriveBy: '2026-10-13T08:30:00+08:00' });
    expect(result.routes.every(r => r.meetsDeadline === false)).toBe(true);
    expect(result.bestDeparture).toBeNull();
    const first = result.routes.find(r => r.candidate.id === 'xb-1-lok-ma-chau')!;
    expect(Date.parse(first.assessment.reliability.etaRange[0]) - Date.parse(first.candidate.journey.arriveAt)).toBe(12 * 60000);
  });
  it('未知走廊回傳明確 unavailable', async () => {
    const result = await analyzeJourney({ ...request, origin: 'huaqiangbei' });
    expect(result.action).toBe('unavailable'); expect(result.routes).toEqual([]);
  });
  it('改選終點後實際旅程也抵達該終點', async () => {
    const raw = await createFixtureProvider().fetch({ ...request, destination: 'civic-center' }, new AbortController().signal);
    for (const item of raw!) {
      const { journey } = parseRawJourney(item.journey);
      expect(journey.segments.at(-1)?.to.id).toBe('civic-center');
    }
  });
  it('人流時段模型可以帶來較低風險出發時點', async () => {
    const result = await analyzeJourney({ ...request, departAt: '2026-10-13T09:00:00+08:00' });
    expect(result.bestDeparture?.departAt).toBe('2026-10-13T09:30:00+08:00');
    expect(result.bestDeparture!.riskScore!).toBeLessThan(result.departureOptions[0]!.riskScore!);
  });
  it.each(['fastest', 'reliable', 'less_crowded', 'balanced'] as const)('模式 %s 的全鏈路使用相同模式', async mode => {
    const result = await analyzeJourney({ ...request, mode });
    expect(result.routes.every(r => r.assessment.mode === mode && r.assessment.risk.mode === mode)).toBe(true);
  });
});
describe('行程 API 驗證', () => {
  it('正常輸入成功', async () => { expect((await handleJourneyRequest(request)).status).toBe(200); });
  it.each([{ ...request, origin: 'unknown' }, { ...request, departAt: 'bad-date' }, { ...request, unexpected: true }, { ...request, scenario: 'live' }, { ...request, arriveBy: '2026-10-13T07:00' }])('拒絕無效輸入 %#', async invalid => { expect((await handleJourneyRequest(invalid)).status).toBe(400); });
});
