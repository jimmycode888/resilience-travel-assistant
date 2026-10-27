/** Diagnostic observations of A/B/C boundaries; assertions document current behavior. */
import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {createTeamJourneyService,resolveRoutes} from '@/lib/integration';
import {parseArriveBy} from '@/lib/time';
import type {TeamJourneyModules,TeamJourneyRequest} from '@/lib/types/team-integration';
const request:TeamJourneyRequest={origin:'central-exchange-square',destination:'futian-station-sz',departAt:'2026-10-13T08:00:00+08:00',arriveBy:'2026-10-13T11:00:00+08:00',mode:'balanced'};
it('記錄共享東鐵故障點仍須 B/C 作用域及獨立備選保護',async()=>{
 const modules:TeamJourneyModules={resolveCandidates:async query=>(await resolveRoutes({query,providers:[]})).resolution,resolveRouteData:async route=>({routeId:route.id,quality:'fixture',confidence:'low',source:'D 診斷 mock',sourceUrl:null,updatedAt:'2026-10-13T07:58:00+08:00',expiresAt:'2026-10-13T08:10:00+08:00',value:{quality:'fixture',service:{status:'ok',crowding:'low',delayMinutes:0},incidents:[{id:'shared',title:'東鐵中斷訊號',detail:'測試 B 只傳 incident 未傳 disrupted',affects:['東鐵線']}]}}),decide:async()=>({action:'go',primaryRouteId:'xb-1-lok-ma-chau',backupRouteIds:['xb-2-lo-wu'],departureWindow:null,explanations:[],notices:['診斷 mock，非 C 正式模型']})};
 const actual=await createTeamJourneyService(modules)(request,'2026-10-13T07:59:00+08:00');
 expect(actual.decision?.backupRouteIds).toEqual(['xb-2-lo-wu']);
 writeFileSync('docs/d-phase2-2026-10-10/shared-disruption-reproduction.json',JSON.stringify({request,injected:'service.status=ok, incident.affects=[東鐵線], C mock explicitly chooses xb-1 and xb-2',actual},null,2));
});
it('記錄 A 時區 ISO 日曆正規化缺口；D HTTP 已提前拒絕',()=>{
 const input='2026-02-30T08:00:00+08:00',actual=parseArriveBy(input);
 expect(actual.ok).toBe(true);
 writeFileSync('docs/d-phase2-2026-10-10/iso-reproduction.json',JSON.stringify({input,actual,impact:'直接呼叫 A 時間工具可能把非法日期正規化；D 嚴格解碼會拒絕'},null,2));
});
