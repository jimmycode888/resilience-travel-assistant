import { describe, expect, it } from 'vitest';
import { isIndependent, planTrigger, selectBackup, sharesPort, sharesTrunk, type PlanRouteView } from '@/lib/plan';

function view(overrides: Partial<PlanRouteView> & Pick<PlanRouteView, 'routeId' | 'label'>): PlanRouteView {
  return {
    eligible: true,
    meetsDeadline: true,
    rankScore: 80,
    crossesBorder: false,
    portIds: [],
    trunkLines: [],
    ...overrides,
  };
}

describe('C4 · Plan B（含跨境換口岸）', () => {
  it('境內：不與主路共用長途線路才算獨立', () => {
    const primary = view({ routeId: 'R1', label: 'R1', trunkLines: ['東鐵線'] });
    const same = view({ routeId: 'R2', label: 'R2', trunkLines: ['東鐵線'] });
    const other = view({ routeId: 'R3', label: 'R3', trunkLines: ['屯馬線'] });
    expect(sharesTrunk(primary, same)).toBe(true);
    expect(isIndependent(primary, same)).toBe(false);
    expect(selectBackup(primary, [same, other])!.routeId).toBe('R3');
  });

  it('跨境：換口岸的備選優先，且不得共用同一口岸', () => {
    const primary = view({ routeId: 'XB-1', label: '落馬洲方案', crossesBorder: true, portIds: ['lok-ma-chau'] });
    const sameport = view({ routeId: 'XB-2', label: '羅湖方案', crossesBorder: true, portIds: ['lok-ma-chau'] });
    const otherport = view({ routeId: 'XB-3', label: '深圳灣方案', crossesBorder: true, portIds: ['shenzhen-bay'] });
    expect(sharesPort(primary, sameport)).toBe(true);
    const backup = selectBackup(primary, [sameport, otherport]);
    expect(backup!.routeId).toBe('XB-3');
    expect(backup!.trigger).toContain('口岸');
  });

  it('沒有真正獨立的備選時回傳 null（不做假 Plan B）', () => {
    const primary = view({ routeId: 'R1', label: 'R1', trunkLines: ['東鐵線'], portIds: ['lo-wu'], crossesBorder: true });
    const twin = view({ routeId: 'R2', label: 'R2', trunkLines: ['東鐵線'], portIds: ['lo-wu'], crossesBorder: true });
    expect(selectBackup(primary, [twin])).toBeNull();
  });

  it('排除不可行（已完成排除）的候選', () => {
    const primary = view({ routeId: 'R1', label: 'R1' });
    const excluded = view({ routeId: 'R2', label: 'R2', eligible: false, trunkLines: ['西鐵線'] });
    expect(selectBackup(primary, [excluded])).toBeNull();
  });

  it('同分時以 routeId 字典序決勝（決定性）', () => {
    const primary = view({ routeId: 'R1', label: 'R1' });
    const a = view({ routeId: 'R3', label: 'R3', rankScore: 90 });
    const b = view({ routeId: 'R2', label: 'R2', rankScore: 90 });
    expect(selectBackup(primary, [a, b])!.routeId).toBe('R2');
  });

  it('切換條件引用實際備選名稱', () => {
    const primary = view({ routeId: 'R1', label: 'R1' });
    const backup = view({ routeId: 'R2', label: 'R2 巴士' });
    expect(planTrigger(primary, backup)).toContain('R2 巴士');
  });
});
