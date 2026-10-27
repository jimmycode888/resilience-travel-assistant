import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {decodeTeamResult,requestSchema,iso} from '@/components/d-team/contract';
import {evaluateFixture} from '@/components/d-team/fixtures';
import {SCENARIOS} from '@/components/d-team/scenarios';
import {DecisionPanel,RouteDetails,RouteCards} from '@/components/d-team/TeamResults';
import {leafletGeometry,routeStyle,displayQueue} from '@/components/d-team/presentation';
import {RequestGate,loadTeam} from '@/components/d-team/client';
import type {TeamJourneyRequest} from '@/lib/types/team-integration';
const request:TeamJourneyRequest={origin:'central-exchange-square',destination:'futian-station-sz',departAt:'2026-10-13T08:00:00+08:00',arriveBy:'2026-10-13T11:00:00+08:00',mode:'balanced'};
const noop=()=>{};
afterEach(()=>vi.unstubAllGlobals());
describe('D 正式契約 fixture 與界面',()=>{
 for(const scenario of SCENARIOS)it(`${scenario} 嚴格解碼並顯示`,async()=>{
  const result=decodeTeamResult(await evaluateFixture(request,scenario));
  const html=renderToStaticMarkup(createElement(DecisionPanel,{result,onSelect:noop,fixture:true}));
  if(scenario==='normal')expect(html).toContain('C 正式決策未接入');
  if(scenario==='go')expect(html).toContain('D mock 決策');
  if(scenario==='hold'||scenario==='severe')expect(html).toContain('暫緩出行');
  if(scenario==='unavailable'||scenario==='deadline')expect(html).toContain('暫無可執行方案');
  if(scenario==='empty')expect(result.routes).toHaveLength(0);
  if(scenario==='no-backup')expect(html).toContain('沒有備選方案');
  if(scenario==='disruption')expect(result.routes.filter(r=>r.candidate.journey.segments.some(s=>s.line?.includes('東鐵'))).every(r=>!r.eligible)).toBe(true);
  for(const route of result.routes){
   const details=renderToStaticMarkup(createElement(RouteDetails,{route,evaluatedAt:result.evaluatedAt}));
   expect(details).toContain(route.assessment.reliability.confidenceNote);
   expect(details).not.toMatch(/準時[^<]{0,12}\d+%/);
   if(scenario==='missing')expect(details).toContain('缺少情境資料');
   if(scenario==='stale')expect(details).toContain('已過期');
   if(scenario==='critical')expect(details).toContain('◆');
   if(scenario==='deadline')expect(details).toContain('趕不上到達期限');
  }
 });
 it('相同輸入確定性',async()=>expect(await evaluateFixture(request,'go')).toEqual(await evaluateFixture(request,'go')));
 it.each(['lok-ma-chau','lo-wu','shenzhen-bay'])('口岸 %s 不混用',async port=>{
  const result=await evaluateFixture({...request,preferPortId:port},'normal');expect(result.routes.length).toBeGreaterThan(0);expect(result.routes.every(r=>r.candidate.journey.borderPortIds.includes(port))).toBe(true);
 });
 it('深夜關閉不顯示可執行推薦',async()=>{
  const result=await evaluateFixture({...request,departAt:'2026-10-13T23:00:00+08:00',arriveBy:undefined},'go');expect(result.routes.every(r=>!r.eligible)).toBe(true);expect(result.decision?.action).toBe('unavailable');
 });
 it('超時 A 基礎排序保持實際值但明示不可按期限執行',async()=>{
  const result=await evaluateFixture(request,'deadline');expect(result.recommendedRouteId).not.toBeNull();
  const html=renderToStaticMarkup(createElement(RouteCards,{result,selectedId:result.recommendedRouteId,onSelect:noop}));expect(html).toContain('無法滿足期限');expect(html).not.toContain('A 基礎推薦（非 C 行動建議）');
 });
 it('口岸 envelope 排隊顯示與 ETA 使用同一來源',async()=>{
  const result=await evaluateFixture(request,'normal');const r=result.routes[0]!;const s=r.candidate.journey.segments.find(s=>s.border)!;
  r.data!.value.border={...s.border!,queueMinutesRange:[30,60],confidence:'medium'};expect(displayQueue(r,s)?.queueMinutesRange).toEqual([30,60]);
  r.data!.value.border.portId='wrong-port';expect(displayQueue(r,s)).toEqual(s.border);
 });
 it('經緯度轉換及跨境/不可行線型',async()=>{
  const result=await evaluateFixture(request,'normal');const r=result.routes[0]!;const s=r.candidate.journey.segments.find(s=>s.kind==='border_crossing')!;
  const p=s.geometry[0]!;expect(leafletGeometry(s)[0]).toEqual([p[1],p[0]]);
  expect(routeStyle(r,s,true)).toMatchObject({color:'#8653ad',dashArray:'7 7',weight:7});expect(routeStyle({...r,eligible:false},s,false)).toMatchObject({color:'#8b99a1',dashArray:'2 5',weight:4});
 });
 it('不接受演示契約或無效決策',async()=>{
  expect(()=>decodeTeamResult({action:'go',routes:[]})).toThrow('正式團隊契約');const r=await evaluateFixture(request,'go');r.decision!.primaryRouteId='R1';expect(()=>decodeTeamResult(r)).toThrow();
 });
 it('拒絕重複 ID 和缺失五因子',async()=>{
  const r=await evaluateFixture(request,'normal');r.routes.push(r.routes[0]!);expect(()=>decodeTeamResult(r)).toThrow();r.routes.pop();r.routes[0]!.assessment.risk.breakdown.factors.pop();expect(()=>decodeTeamResult(r)).toThrow();
 });
 it.each(['',' ','2026-02-30T08:00:00+08:00','2026-02-30T08:00:00Z','2026-10-13T25:00:00+08:00','2026-10-13T08:00'])('拒絕空白/非法 ISO %s',value=>expect(iso.safeParse(value).success).toBe(false));
 it('香港時間及期限/同地點驗證',()=>{
  expect(requestSchema.safeParse(request).success).toBe(true);expect(requestSchema.safeParse({...request,arriveBy:''}).success).toBe(false);expect(requestSchema.safeParse({...request,arriveBy:request.departAt}).success).toBe(false);expect(requestSchema.safeParse({...request,destination:request.origin}).success).toBe(false);
 });
});
describe('D HTTP 與請求競爭',()=>{
 it('舊請求失效和 Abort',()=>{const gate=new RequestGate(),first=gate.begin(),second=gate.begin();expect(first.signal.aborted).toBe(true);expect(gate.current(first.epoch)).toBe(false);expect(gate.current(second.epoch)).toBe(true);gate.cancel();expect(gate.current(second.epoch)).toBe(false);});
 it('fixture 標記與正式 HTTP 不互換',async()=>{
  const result=await evaluateFixture(request,'normal'),fetch=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({kind:'d-team-fixture-v1',result})));vi.stubGlobal('fetch',fetch);
  expect(await loadTeam(request,'normal','fixture',new AbortController().signal)).toEqual(result);expect(fetch.mock.calls[0]![0]).toBe('/api/d-team-fixture');await expect(loadTeam(request,'normal','formal',new AbortController().signal)).rejects.toThrow('正式團隊契約');
 });
 it.each([400,500,503])('HTTP %s 可讀錯誤',async status=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('secret provider trace',{status})));await expect(loadTeam(request,'normal','fixture',new AbortController().signal)).rejects.toThrow(status===400?'檢查':'失敗');});
 it('正式 HTTP 直接解碼結果（mock transport，不代表正式聯調）',async()=>{const result=await evaluateFixture(request,'normal');vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>new Response(JSON.stringify(result))));expect(await loadTeam(request,'normal','formal',new AbortController().signal)).toEqual(result);});
 it('正式端點 404 明示未接線',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:404})));await expect(loadTeam(request,'normal','formal',new AbortController().signal)).rejects.toThrow('尚未接線');});
 it.each(['not-json','{"routes":[]}','{"kind":"d-team-fixture-v1","result":{}}'])('非法 body %s',async body=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(body)));await expect(loadTeam(request,'normal','fixture',new AbortController().signal)).rejects.toThrow();});
});
