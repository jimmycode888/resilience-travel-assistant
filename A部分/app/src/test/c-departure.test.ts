import { describe, expect, it } from 'vitest';
import { departureGrid, searchDepartureWindow, type DepartureSample } from '@/lib/departure';

const FROM = '2026-10-13T17:30:00+08:00';

/** 依腳本產生風險序列：用「離 FROM 幾分鐘」對應風險分。 */
function scripted(risk: (offset: number) => number | null, deadline: (offset: number) => boolean | null = () => true) {
  return (departAt: string): DepartureSample => {
    const offset = Math.round((Date.parse(departAt) - Date.parse(FROM)) / 60000);
    const score = risk(offset);
    return {
      departAt,
      routeId: score === null ? null : 'R1',
      riskScore: score,
      meetsDeadline: score === null ? null : deadline(offset),
    };
  };
}

describe('C3 · 最佳出發窗口', () => {
  it('固定粒度產生網格（含起點，step 之後不含 horizon 外）', () => {
    const grid = departureGrid(FROM, 30, 10);
    expect(grid).toEqual([
      '2026-10-13T17:30:00+08:00',
      '2026-10-13T17:40:00+08:00',
      '2026-10-13T17:50:00+08:00',
      '2026-10-13T18:00:00+08:00',
    ]);
  });

  it('挑出風險最低的連續區段（含 slack 擴張）', () => {
    // 17:30→78, 17:40→72, 17:50→64, 18:00→54, 18:10→41, 18:20→39, 18:30→45, 18:40→60
    const scores: Record<number, number> = { 0: 78, 10: 72, 20: 64, 30: 54, 40: 41, 50: 39, 60: 45, 70: 60 };
    const window = searchDepartureWindow({
      from: FROM,
      horizonMinutes: 70,
      stepMinutes: 10,
      sampleRisk: scripted((offset) => scores[offset] ?? 60),
    });
    expect(window).not.toBeNull();
    // 最低 39（18:20）；slack 10 → 納入 41、39、45；64 被排除。
    expect(window!.start).toBe('2026-10-13T18:10:00+08:00');
    expect(window!.end).toBe('2026-10-13T18:40:00+08:00');
    expect(window!.confidence).toBe('low');
    expect(window!.evidence).toContain('未經歷史校準');
  });

  it('沒有任何可行樣本時回傳 null', () => {
    const window = searchDepartureWindow({ from: FROM, sampleRisk: scripted(() => null) });
    expect(window).toBeNull();
  });

  it('趕不上期限的樣本不列入窗口', () => {
    // 只有 17:30 趕得上，其餘超時。
    const window = searchDepartureWindow({
      from: FROM,
      horizonMinutes: 20,
      stepMinutes: 10,
      sampleRisk: scripted((offset) => 80 - offset, (offset) => offset === 0),
    });
    expect(window).not.toBeNull();
    expect(window!.start).toBe(FROM);
    expect(window!.end).toBe('2026-10-13T17:40:00+08:00');
  });

  it('同輸入同輸出（決定性）', () => {
    const make = () => searchDepartureWindow({ from: FROM, sampleRisk: scripted((offset) => 60 - offset) });
    expect(make()).toEqual(make());
  });
});
