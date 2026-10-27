/**
 * C4 · Plan B 引擎（成員 C，含跨境換口岸）。
 *
 * 境內與跨境的 Plan B **語義不同**：
 *   - 境內：換線路。備選不得與主線共用同一條主要長途線路（避免同一故障段）。
 *   - 跨境：換口岸。這才是跨境使用者真正需要的建議。
 *
 * **硬性校驗（回應 D2-04）**：
 *   備選不得與主路共用同一口岸，也不得共用同一條「主要長途線路」（非步行且 ≥ 20 分鐘）。
 *   找不到**真正獨立**的備選時回傳 null——寧可沒有 Plan B，也不要給一條會一起掛掉的退路。
 *
 * 純函式、確定性：同輸入同輸出。
 */
/** 選擇備選所需的最小路線視圖（由 `TeamCoreResult.routes` 投影而來）。 */
export interface PlanRouteView {
  routeId: string;
  label: string;
  eligible: boolean;
  meetsDeadline: boolean | null;
  rankScore: number;
  crossesBorder: boolean;
  /** 這條路線經過的口岸；境內為空陣列。 */
  portIds: readonly string[];
  /** 主要長途線路名（非步行且 ≥ 20 分鐘），用於判斷是否共用故障段。 */
  trunkLines: readonly string[];
}

export interface PlanSelection {
  routeId: string;
  label: string;
  /** 為什麼選它（可顯示）。 */
  reason: string;
  /** 什麼情況下切換（可顯示、可觸發）。 */
  trigger: string;
  /** 是否與主路真正獨立（不同口岸 / 不同主線）。 */
  independent: true;
  crossesBorder: boolean;
}

/** 兩條路線是否共用口岸。 */
export function sharesPort(a: PlanRouteView, b: PlanRouteView): boolean {
  return a.portIds.some((portId) => b.portIds.includes(portId));
}

/** 兩條路線是否共用主要長途線路。 */
export function sharesTrunk(a: PlanRouteView, b: PlanRouteView): boolean {
  return a.trunkLines.some((line) => b.trunkLines.includes(line));
}

/** 備選是否與主路真正獨立。 */
export function isIndependent(primary: PlanRouteView, backup: PlanRouteView): boolean {
  return !sharesPort(primary, backup) && !sharesTrunk(primary, backup);
}

/** 依情境產生切換條件文字（跨境：換口岸；境內：換線路）。 */
export function planTrigger(primary: PlanRouteView, backup: PlanRouteView): string {
  if (primary.crossesBorder) {
    return `若主路線口岸排隊超過估算上限、口岸臨時限流或東鐵線／接駁交通中斷，改經 ${backup.label} 的口岸（出行前重新核實口岸開放時間）。`;
  }
  return `若主路線發生服務中斷、延誤超出估算上限或指定轉乘站人流風險升至「高」，改乘 ${backup.label}（避開與主路相同的長途線路）。`;
}

/**
 * 選出 Plan B。
 *
 * 選擇序（確定性）：真正獨立 → 可行（eligible）→ 不違反到達期限 → 排名分較高 → routeId 字典序。
 * 沒有獨立候選時回傳 null。
 */
export function selectBackup(primary: PlanRouteView, others: readonly PlanRouteView[]): PlanSelection | null {
  const candidates = others
    .filter((route) => route.routeId !== primary.routeId)
    .filter((route) => route.eligible)
    .filter((route) => isIndependent(primary, route))
    .sort((a, b) => {
      const deadlineRank = (route: PlanRouteView) => (route.meetsDeadline === false ? 1 : 0);
      const byDeadline = deadlineRank(a) - deadlineRank(b);
      if (byDeadline !== 0) return byDeadline;
      if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
      return a.routeId.localeCompare(b.routeId);
    });

  const backup = candidates[0];
  if (!backup) return null;

  const reason = primary.crossesBorder
    ? `改用 ${backup.label}：與主路不同口岸（${backup.portIds.join("、") || "未標示"}），不會與主路一起受同一口岸影響；${backup.meetsDeadline === false ? "但此備選可能趕不上期限。" : "班次與口岸安排仍需另行核實。"}`
    : `改用 ${backup.label}：不與主路共用主要長途線路，具獨立性；${backup.meetsDeadline === false ? "但此備選可能趕不上期限。" : "班次仍需另行核實。"}`;

  return {
    routeId: backup.routeId,
    label: backup.label,
    reason,
    trigger: planTrigger(primary, backup),
    independent: true,
    crossesBorder: backup.crossesBorder,
  };
}
