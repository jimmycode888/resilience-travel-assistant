/** Explicit test modules. Neither B live data nor C's production engine. Server/test only. */
import { createTeamJourneyService, resolveRoutes } from '@/lib/integration';
import { addMinutes } from '@/lib/time';
import type { TeamJourneyModules, TeamJourneyRequest } from '@/lib/types/team-integration';
import type { FixtureScenario } from './scenarios';
export async function evaluateFixture(request:TeamJourneyRequest, scenario:FixtureScenario) {
  const evaluatedAt=addMinutes(request.departAt,-1); // Replay clock, never current/live time.
  const modules:TeamJourneyModules={
    resolveCandidates:async query=>{
      const resolution=(await resolveRoutes({query,providers:[]})).resolution;
      if(scenario==='empty')resolution.candidates=[];
      resolution.notices.push('D 測試 fixture；座標未核實，折線僅示意，非導航路網。評估時間為輸入出發前一分鐘的回放時鐘。');
      if(scenario==='timeout')resolution.notices.push('模擬上游逾時：已回退 fixture，非真實上游故障演練。');
      return resolution;
    },
    resolveRouteData:async route=>{
      if(scenario==='missing')return null;
      const disrupted=scenario==='disruption'&&route.journey.segments.some(s=>s.line?.includes('東鐵'));
      const border=route.journey.segments.find(s=>s.border)?.border;
      return {routeId:route.id,source:'D 界面測試 fixture（非 B 實時來源）',sourceUrl:null,updatedAt:addMinutes(evaluatedAt,-1),expiresAt:addMinutes(evaluatedAt,scenario==='stale'?-1:15),quality:'fixture',confidence:'low',value:{quality:'fixture',weather:{condition:scenario==='severe'?'storm':'clear',warning:scenario==='severe'?'黑色暴雨警告信號':null,updatedAt:evaluatedAt},service:{status:disrupted?'disrupted':'ok',delayMinutes:0,crowding:'low',updatedAt:evaluatedAt},incidents:disrupted?[{id:'d-east-rail',title:'模擬東鐵全線中斷',detail:'所有東鐵候選均受影響',affects:['東鐵線']}]:[],crowd:{level:scenario==='critical'?'critical':'low',confidence:'low',evidence:'D 測試信號，沒有真實人數'},border}};
    },
  };
  if(scenario!=='normal'&&scenario!=='missing'&&scenario!=='stale'&&scenario!=='timeout'&&scenario!=='empty'&&scenario!=='critical')modules.decide=async core=>{
    const available=core.routes.filter(r=>r.eligible&&r.meetsDeadline!==false);
    const primary=available[0];
    const action=scenario==='severe'||scenario==='hold'?'hold':scenario==='unavailable'||!primary?'unavailable':'go';
    const main=action==='go'?primary:null;
    const backup=main&&scenario!=='no-backup'?available.find(r=>r.candidate.id!==main.candidate.id&&!r.candidate.journey.borderPortIds.some(p=>main.candidate.journey.borderPortIds.includes(p))&&!r.candidate.journey.segments.some(s=>s.line&&main.candidate.journey.segments.some(m=>m.line===s.line&&m.durationMinutes>=15))):undefined;
    return {action,primaryRouteId:main?.candidate.id??null,backupRouteIds:backup?[backup.candidate.id]:[],departureWindow:main?{start:request.departAt,end:addMinutes(request.departAt,10),confidence:'low',evidence:'D mock 固定 10 分鐘窗口，僅測試顯示；不是 C 模型預測。'}:null,explanations:main?[{routeId:main.candidate.id,text:'D mock 主路說明',evidence:['A 的可行性及 ETA；窗口為測試值']}]:[],notices:['C decision 為 D mock，不代表 C 正式決策已接入。']};
  };
  const input=scenario==='deadline'?{...request,arriveBy:addMinutes(request.departAt,1)}:request;
  return createTeamJourneyService(modules)(input,evaluatedAt);
}
