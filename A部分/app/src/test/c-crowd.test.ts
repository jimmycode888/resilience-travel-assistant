import { describe, expect, it } from 'vitest';
import { assessCrowd, crowdScoreOf } from '@/lib/crowd';

const PEAK_MONDAY = '2026-10-13T08:00:00+08:00'; // 週二早上高峰
const OFFPEAK_MONDAY = '2026-10-13T14:00:00+08:00';
const PEAK_SUNDAY = '2026-10-18T08:00:00+08:00';

describe('C1 · 擁擠風險引擎', () => {
  it('只輸出等級與定性信心，不帶任何精確人數欄位', () => {
    const result = assessCrowd({ at: PEAK_MONDAY, majorInterchange: true, quality: 'fixture' });
    expect(['low', 'medium', 'high', 'critical']).toContain(result.level);
    expect(['high', 'medium', 'low']).toContain(result.confidence);
    expect(result.signal).toEqual({ level: result.level, confidence: result.confidence, evidence: result.evidence });
    // 不得有任何「人數」欄位（免責文案可以提到「不得當成人數」）。
    expect(Object.keys(result)).not.toContain('count');
    expect(Object.keys(result)).not.toContain('headcount');
    expect(result).not.toHaveProperty('people');
    expect(result.evidence).toContain('不得當成人數或機率');
  });

  it('大型換乘站 + 工作日晚高峰 + 高辦公密度 → 高或極高', () => {
    const result = assessCrowd({
      at: PEAK_MONDAY,
      majorInterchange: true,
      officeDensity: 'high',
      delayMinutes: 15,
      quality: 'live',
    });
    expect(['high', 'critical']).toContain(result.level);
    expect(result.factors.length).toBeGreaterThanOrEqual(3);
  });

  it('離峰時段非換乘站 → 低', () => {
    const result = assessCrowd({ at: OFFPEAK_MONDAY, quality: 'live' });
    expect(result.level).toBe('low');
  });

  it('週末不套用工作日晚高峰（同為 08:00）', () => {
    const weekday = assessCrowd({ at: PEAK_MONDAY, quality: 'live' });
    const sunday = assessCrowd({ at: PEAK_SUNDAY, quality: 'live' });
    expect(weekday.score).toBeGreaterThan(sunday.score);
  });

  it('fixture 品質把可信度壓到低，且留下未校準與降級說明', () => {
    const result = assessCrowd({ at: PEAK_MONDAY, majorInterchange: true, serviceCrowding: 'high', quality: 'fixture' });
    expect(result.confidence).toBe('low');
    expect(result.notices.join(' ')).toContain('資料品質');
    expect(result.evidence).toContain('未經校準');
  });

  it('因素配分加總等於分數（可溯源、可覆核）', () => {
    const result = assessCrowd({ at: PEAK_MONDAY, majorInterchange: true, officeDensity: 'medium', crossesBorder: true, quality: 'live' });
    const sum = result.factors.reduce((total, factor) => total + factor.points, 0);
    expect(result.score).toBe(Math.min(100, sum));
  });

  it('同輸入同輸出（決定性）', () => {
    const input = { at: PEAK_MONDAY, majorInterchange: true, officeDensity: 'high' as const, quality: 'live' as const };
    expect(assessCrowd(input)).toEqual(assessCrowd(input));
  });

  it('等級分數與 A 的風險引擎一致', () => {
    expect(crowdScoreOf('critical')).toBe(95);
    expect(crowdScoreOf('low')).toBe(15);
  });
});
