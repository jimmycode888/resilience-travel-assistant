import { describe, expect, it } from 'vitest';
import { handleTeamJourneyRequest } from '@/lib/api/team-journey-handler';
import type { ApiErrorBody } from '@/lib/api/errors';
import type { TeamJourneyResult } from '@/lib/types/team-integration';

const request = {
  origin: 'central-exchange-square',
  destination: 'futian-station-sz',
  departAt: '2026-10-13T08:00:00+08:00',
  arriveBy: '2026-10-13T11:00:00+08:00',
  mode: 'balanced',
};
const now = () => Date.parse('2026-10-13T07:00:00+08:00');
const asResult = (body: unknown) => body as TeamJourneyResult;
const asError = (body: unknown) => body as ApiErrorBody;

describe('POST /api/team-journey 的伺服器邏輯', () => {
  it('回傳正式 TeamJourneyResult 與跨境候選', async () => {
    const res = await handleTeamJourneyRequest(request, now);
    expect(res.status).toBe(200);
    const body = asResult(res.body);
    expect(body.routes.length).toBeGreaterThanOrEqual(2);
    expect(body.routes.some((route) => route.candidate.journey.crossesBorder)).toBe(true);
    expect(body.evaluatedAt).toBe('2026-10-13T07:00:00+08:00');
  });

  it('C 已接入：產生正式決策，且不得升用被排除的路線', async () => {
    const res = await handleTeamJourneyRequest(request, now);
    const body = asResult(res.body);
    const decision = body.decision;
    expect(decision).not.toBeNull();
    expect(['go', 'hold', 'unavailable']).toContain(decision!.action);

    const eligibleIds = new Set(
      body.routes.filter((route) => route.eligible && route.exclusions.length === 0).map((route) => route.candidate.id),
    );
    const referenced = [decision!.primaryRouteId, ...decision!.backupRouteIds].filter((id): id is string => Boolean(id));
    for (const id of referenced) expect(eligibleIds.has(id)).toBe(true);
    // 只有 go 才提供出發窗口；窗口必須落在出發時間之後。
    if (decision!.action === 'go') {
      expect(decision!.departureWindow).not.toBeNull();
      expect(Date.parse(decision!.departureWindow!.start)).toBeGreaterThanOrEqual(Date.parse(body.request.departAt));
      expect(Date.parse(decision!.departureWindow!.end)).toBeGreaterThanOrEqual(Date.parse(decision!.departureWindow!.start));
    } else {
      expect(decision!.departureWindow).toBeNull();
    }
  });

  it('B 未接入時（無情境資料）風險為保守、信心為低，並在 notices 明示', async () => {
    const res = await handleTeamJourneyRequest(request, now);
    const body = asResult(res.body);
    expect(body.routes.every((route) => route.data === null)).toBe(true);
    expect(body.routes.every((route) => route.assessment.reliability.onTimeConfidence === 'low')).toBe(true);
    expect(body.notices.join(' ')).toContain('未啟用');
  });

  it('相同輸入產生相同結果（決定性）', async () => {
    const first = asResult((await handleTeamJourneyRequest(request, now)).body);
    const second = asResult((await handleTeamJourneyRequest(request, now)).body);
    expect(second).toEqual(first);
  });

  it('拒絕同一起終點、早於出發的期限、未知欄位與非法時間', async () => {
    const same = await handleTeamJourneyRequest({ ...request, destination: 'central-exchange-square' }, now);
    expect(same.status).toBe(400);
    expect(asError(same.body).error.code).toBe('INVALID_INPUT');

    const early = await handleTeamJourneyRequest({ ...request, arriveBy: '2026-10-13T07:00:00+08:00' }, now);
    expect(early.status).toBe(400);

    const extra = await handleTeamJourneyRequest({ ...request, scenario: 'normal' }, now);
    expect(extra.status).toBe(400);

    const badTime = await handleTeamJourneyRequest({ ...request, departAt: '不是時間' }, now);
    expect(badTime.status).toBe(400);
  });

  it('未覆蓋的走廊回傳合法回應（可為空候選），而非 500', async () => {
    const res = await handleTeamJourneyRequest(
      { ...request, origin: 'central-station', destination: 'central-exchange-square' },
      now,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(asResult(res.body).routes)).toBe(true);
  });
});
