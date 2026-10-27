import { describe, expect, it } from 'vitest';
import { assessBorder } from '@/lib/border';
import { estimateBorderQueue } from '@/lib/adapters/port-conditions';

const MORNING_PEAK = '2026-10-13T08:00:00+08:00'; // 週二 08:00（北向高峰）
const OFFPEAK = '2026-10-13T14:00:00+08:00';
const LATE_NIGHT = '2026-10-13T23:30:00+08:00'; // 落馬洲已關閉

describe('C2 · 通關風險引擎', () => {
  it('輸出排隊區間（非單點）並附信心與估算說明', () => {
    const result = assessBorder({ portId: 'lok-ma-chau', at: MORNING_PEAK, direction: 'hk_to_sz', quality: 'live' });
    expect(result.open).toBe(true);
    expect(result.queueMinutesRange).not.toBeNull();
    const [low, high] = result.queueMinutesRange!;
    expect(high).toBeGreaterThan(low);
    expect(result.signal!.queueMinutesRange).toEqual(result.queueMinutesRange);
    expect(result.signal!.note).toContain('估算');
  });

  it('高峰排隊不低於離峰（時段模型單調）', () => {
    const peak = assessBorder({ portId: 'lok-ma-chau', at: MORNING_PEAK, direction: 'hk_to_sz', quality: 'live' });
    const off = assessBorder({ portId: 'lok-ma-chau', at: OFFPEAK, direction: 'hk_to_sz', quality: 'live' });
    expect(peak.queueMinutesRange![1]).toBeGreaterThanOrEqual(off.queueMinutesRange![1]);
  });

  it('口岸關閉時 open=false、不提供 signal（不得參與方案）', () => {
    const result = assessBorder({ portId: 'lok-ma-chau', at: LATE_NIGHT, direction: 'hk_to_sz', quality: 'live' });
    expect(result.open).toBe(false);
    expect(result.signal).toBeNull();
    expect(result.queueMinutesRange).toBeNull();
    expect(result.notices.join(' ')).toContain('未開放');
  });

  it('週末與鐵路中斷會往上加成', () => {
    const base = assessBorder({ portId: 'lo-wu', at: OFFPEAK, direction: 'hk_to_sz', quality: 'live' });
    const disrupted = assessBorder({ portId: 'lo-wu', at: OFFPEAK, direction: 'hk_to_sz', railDisruption: true, quality: 'live' });
    expect(disrupted.queueMinutesRange![1]).toBeGreaterThan(base.queueMinutesRange![1]);
  });

  it('未知或未收錄口岸 → unknown 且不可用', () => {
    const missing = assessBorder({ portId: null, at: MORNING_PEAK, direction: 'hk_to_sz', quality: 'live' });
    expect(missing.level).toBe('unknown');
    expect(missing.signal).toBeNull();
    const unknown = assessBorder({ portId: 'not-a-port', at: MORNING_PEAK, direction: 'hk_to_sz', quality: 'live' });
    expect(unknown.signal).toBeNull();
  });

  it('fixture 品質把信心壓到低', () => {
    const result = assessBorder({ portId: 'lok-ma-chau', at: MORNING_PEAK, direction: 'hk_to_sz', quality: 'fixture' });
    expect(result.confidence).toBe('low');
  });

  it('同輸入同輸出（決定性）', () => {
    const input = { portId: 'lok-ma-chau', at: MORNING_PEAK, direction: 'hk_to_sz' as const, quality: 'live' as const };
    expect(assessBorder(input)).toEqual(assessBorder(input));
  });

  it('排隊區間與 B 的權威估算完全相同（單一來源，不再自帶常數）', () => {
    const c = assessBorder({ portId: 'lok-ma-chau', at: MORNING_PEAK, direction: 'hk_to_sz', quality: 'live' });
    const b = estimateBorderQueue({ portId: 'lok-ma-chau', at: MORNING_PEAK, direction: 'hk_to_sz', quality: 'live' });
    expect(c.queueMinutesRange).toEqual(b.queueMinutesRange);
    expect(c.confidence).toBe(b.confidence);
    expect(c.signal!.queueMinutesRange).toEqual(b.queueMinutesRange);
  });

  it('口岸性質（鐵路／巴士）由 B 的 profile 決定：同一時刻不同口岸可得不同區間', () => {
    const rail = assessBorder({ portId: 'lo-wu', at: OFFPEAK, direction: 'hk_to_sz', quality: 'live' });
    const coach = assessBorder({ portId: 'shenzhen-bay', at: OFFPEAK, direction: 'hk_to_sz', quality: 'live' });
    expect(coach.queueMinutesRange![1]).toBeGreaterThan(rail.queueMinutesRange![1]);
  });

  it('平日補假（dayType=holiday）加上 B 的週末加成常數', () => {
    const weekday = '2026-10-13T14:00:00+08:00'; // 週二
    const base = assessBorder({ portId: 'lok-ma-chau', at: weekday, direction: 'hk_to_sz', quality: 'live' });
    const holiday = assessBorder({ portId: 'lok-ma-chau', at: weekday, direction: 'hk_to_sz', dayType: 'holiday', quality: 'live' });
    expect(holiday.queueMinutesRange![1]).toBeGreaterThan(base.queueMinutesRange![1]);
  });
});
