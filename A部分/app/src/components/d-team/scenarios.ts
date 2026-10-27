export const SCENARIOS = ['normal','go','hold','unavailable','missing','stale','timeout','disruption','severe','empty','no-backup','deadline','critical'] as const;
export type FixtureScenario = typeof SCENARIOS[number];
export const SCENARIO_LABELS:Record<FixtureScenario,string> = {normal:'正常 · C 未接入',go:'模擬 C go',hold:'模擬 C hold',unavailable:'模擬 C unavailable',missing:'資料缺失',stale:'過期資料',timeout:'上游逾時回退',disruption:'東鐵線中斷',severe:'嚴重天氣',empty:'無候選', 'no-backup':'無備選',deadline:'到達超時',critical:'極高人流'};
