import { decodeTeamResult } from './contract';
import type { TeamJourneyRequest } from '@/lib/types/team-integration';
import type { FixtureScenario } from './scenarios';
export type DataSource='fixture'|'formal';
export async function loadTeam(request:TeamJourneyRequest,scenario:FixtureScenario,source:DataSource,signal:AbortSignal){
  const response=await fetch(source==='fixture'?'/api/d-team-fixture':'/api/team-journey',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal,body:JSON.stringify(source==='fixture'?{request,scenario}:request)});
  if(!response.ok)throw new Error(source==='formal'&&response.status===404?'正式團隊 API 尚未接線，請選擇明確標記的 fixture 進行界面測試。':response.status===400?'請檢查行程輸入。':'行程請求失敗，請重試。');
  let raw:unknown;
  try{raw=await response.json();}catch{throw new Error('回應不是有效 JSON，請重試。');}
  if(source==='fixture'){
    if(typeof raw!=='object'||raw===null||!('kind' in raw)||raw.kind!=='d-team-fixture-v1'||!('result' in raw))throw new Error('測試回應缺少 fixture 標記。');
    return decodeTeamResult(raw.result);
  }
  return decodeTeamResult(raw);
}
/** Epoch changes before abort; stale promises cannot overwrite any state. */
export class RequestGate{
  private epoch=0;
  private controller:AbortController|null=null;
  cancel(){this.epoch++;this.controller?.abort();this.controller=null;}
  begin(){this.cancel();this.controller=new AbortController();return {epoch:this.epoch,signal:this.controller.signal};}
  current(epoch:number){return epoch===this.epoch;}
}
