import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextBoarding, routeHk, serviceActive } from '@/lib/transit/hk-router';
import { fromAmap, parseAmapPlans, routeShenzhen, toAmap } from '@/lib/transit/amap';
import { analyzeTransitJourney } from '@/lib/transit/service';
import { walkRoute } from '@/lib/transit/walking';
import { handleJourneyRequest } from '@/lib/api/journey-handler';
import type { HkNetwork, HkPattern, TransitPoint, TransitPlan } from '@/lib/transit/types';
const from: TransitPoint = { name: '起點', lat: 22.28, lon: 114.1, side: 'hk' };
const to: TransitPoint = { name: '終點', lat: 22.28, lon: 114.14, side: 'hk' };
const pattern: HkPattern = { id: '1', line: 'KMB 1', mode: 'bus', stops: [0, 1], offsets: [0, 10], pickup: [true, false], dropoff: [false, true], approximate: true, runs: [['weekday', 480, 1380, 10]] };
const network: HkNetwork = {
 meta: { sourceUrl:'',datasetUrl:'',importedAt:'',feedDate:'2026-10-14',stopCount:4,routeCount:2,patternCount:2,limitations:[] },
 stops: [{...from,id:'a'}, {name:'轉乘站一',id:'b',lat:22.28,lon:114.12}, {name:'轉乘站二',id:'c',lat:22.28,lon:114.121}, {...to,id:'d'}],
 patterns:[pattern,{...pattern,id:'2',line:'KMB 2',stops:[2,3]}],
 calendar: { weekday:{days:[0,1,1,1,1,1,0],start:'20260101',end:'20261231'} }, exceptions:{'20261019':{weekday:2}},
};
const verifiedWalk = async (a:TransitPoint,b:TransitPoint) => ({mode:'walk' as const,line:null,from:a,to:b,minutes:a.lat===b.lat&&a.lon===b.lon?0:3,geometry:[[a.lon,a.lat],[b.lon,b.lat]] as [number,number][]});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('香港公開公交路由',()=>{
 it('按香港本地日期、週末、例外日與有效期篩選',()=>{
  expect(serviceActive(network,'weekday','20261016')).toBe(true);
  expect(serviceActive(network,'weekday','20261017')).toBe(false);
  expect(serviceActive(network,'weekday','20261019')).toBe(false);
  expect(serviceActive(network,'weekday','20270101')).toBe(false);
 });
 it('非精確班次預留完整 headway；末班後不虛構發車',()=>{
  expect(nextBoarding(pattern,0,483,new Set(['weekday']),new Set())).toBe(493);
  expect(nextBoarding(pattern,0,1380,new Set(['weekday']),new Set())).toBeNull();
 });
 it('支援超過24點的前一服務日班次與固定班次',()=>{
  const night={...pattern,runs:[['weekday',1500,1500,0] as [string,number,number,number]]};
  expect(nextBoarding(night,0,55,new Set(),new Set(['weekday']))).toBe(60);
  expect(nextBoarding(night,0,61,new Set(),new Set(['weekday']))).toBeNull();
 });
 it('計算公交換乘，並核驗步行，不使用直線代替可行性',async()=>{
  const verify=vi.fn(verifiedWalk); const plan=await routeHk(network,from,to,'2026-10-16T08:00:00+08:00',verify);
  expect(plan.legs.filter(l=>l.mode==='bus').map(l=>l.line)).toEqual(['KMB 1','KMB 2']);
  expect(verify).toHaveBeenCalled(); expect(plan.legs.filter(l=>l.mode==='walk').every(l=>!l.approximate)).toBe(true);
  expect(plan.minutes).toBe(plan.legs.reduce((sum,l)=>sum+l.minutes,0));
 });
 it('拒絕不可步行的換乘、缺少站點、服務日關閉及跨境輸入',async()=>{
  await expect(routeHk(network,from,to,'2026-10-16T08:00:00+08:00',async()=>{throw Error('blocked');})).rejects.toThrow();
  await expect(routeHk(network,from,to,'2026-10-17T08:00:00+08:00',verifiedWalk)).rejects.toThrow();
  await expect(routeHk(network,{...from,lat:22.7},to,'2026-10-16T08:00:00+08:00',verifiedWalk)).rejects.toThrow();
  await expect(routeHk(network,{...from,side:'sz'},to,'2026-10-16T08:00:00+08:00',verifiedWalk)).rejects.toThrow();
 });
});
describe('高德公交適配與座標',()=>{
 const a:TransitPoint={name:'深圳起點',lat:22.54,lon:114.06,side:'sz'}; const b:TransitPoint={name:'深圳終點',lat:22.55,lon:114.08,side:'sz'};
 const payload=()=>({status:'1',route:{transits:[{duration:'1500',segments:[{bus:{buslines:[{name:'地鐵1號線',type:'地铁线路',duration:'1200',departure_stop:{name:a.name,location:toAmap(a)},arrival_stop:{name:b.name,location:toAmap(b)},polyline:`${toAmap(a)};${toAmap(b)}`}]}}]}]}});
 it('WGS84與GCJ02往返偏差小於約1米',()=>{
  const [lon,lat]=fromAmap(toAmap(a)); expect(lon).toBeCloseTo(a.lon,5);expect(lat).toBeCloseTo(a.lat,5);expect(toAmap(a)).not.toBe(`${a.lon},${a.lat}`);
 });
 it('解析實際公交步驟，保留總耗時及候車預留',()=>{
  const plans=parseAmapPlans(payload(),a,b);expect(plans).toHaveLength(1);expect(plans[0]?.minutes).toBe(25);expect(plans[0]?.legs[0]?.waitMinutes).toBe(5);expect(plans[0]?.legs[0]?.mode).toBe('mtr');
 });
 it('不把錯誤、缺失幾何或缺少接駁的回應變成成功路線',()=>{
  expect(()=>parseAmapPlans({status:'0',infocode:'10001'},a,b)).toThrow('10001');
  const raw=payload();raw.route.transits[0]!.segments[0]!.bus.buslines[0]!.polyline='';expect(parseAmapPlans(raw,a,b)).toEqual([]);
  expect(()=>fromAmap('NaN,22')).toThrow();
 });
 it('平台吸附起點超過150米時核驗入口步行並計入耗時',async()=>{
  vi.stubEnv('AMAP_WEB_SERVICE_KEY','test-key');
  const shifted={...a,lon:a.lon+0.003}; const raw=payload();
  raw.route.transits[0]!.segments[0]!.bus.buslines[0]!.departure_stop.location=toAmap(shifted);
  raw.route.transits[0]!.segments[0]!.bus.buslines[0]!.polyline=`${toAmap(shifted)};${toAmap(b)}`;
  expect(parseAmapPlans(raw,a,b)).toEqual([]);
  const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>raw});
  const verify=vi.fn(verifiedWalk); const plans=await routeShenzhen(a,b,'2026-10-17T08:00:00+08:00',fetchMock,verify);
  expect(verify).toHaveBeenCalledTimes(1);expect(plans[0]?.minutes).toBe(28);expect(plans[0]?.legs[0]?.mode).toBe('walk');expect(plans[0]?.legs[0]?.approximate).toBeUndefined();
  await expect(routeShenzhen(a,b,'2026-10-17T08:00:00+08:00',fetchMock,async()=>{throw Error('no footpath');})).rejects.toThrow('未返回完整');
 });
 it('未配置Key不發出請求；配置後請求帶深圳城市及正確香港時區時間',async()=>{
  vi.stubEnv('AMAP_WEB_SERVICE_KEY',''); const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>payload()});
  await expect(routeShenzhen(a,b,'2026-10-16T00:00:00Z',fetchMock)).rejects.toThrow('Key');expect(fetchMock).not.toHaveBeenCalled();
  vi.stubEnv('AMAP_WEB_SERVICE_KEY','test-key');await routeShenzhen(a,b,'2026-10-16T00:00:00Z',fetchMock);
  const url=new URL(String(fetchMock.mock.calls[0]?.[0]));expect(url.searchParams.get('time')).toBe('08:00');expect(url.searchParams.get('city')).toBe('0755');expect(url.searchParams.get('origin')).toBe(toAmap(a));
 });
});
describe('步行與跨境整合',()=>{
 const request={origin:'test-origin',originPlace:{...from,id:'test-origin',kind:'address' as const,coordinatesVerified:false},destination:'futian-station-sz',departAt:'2026-10-16T08:00:00+08:00',routing:'transit' as const,mode:'balanced' as const,scenario:'normal' as const};
 const portNetwork={...network,stops:[...network.stops,{name:'深圳灣口岸',id:'12728',lat:22.5014,lon:113.9458},{name:'香園圍口岸',id:'10000179',lat:22.55202,lon:114.15411}]};
 const plan=async(_n:HkNetwork,a:TransitPoint,b:TransitPoint):Promise<TransitPlan>=>({legs:[{mode:'bus',line:'TEST',from:a,to:b,minutes:30,geometry:[[a.lon,a.lat],[b.lon,b.lat]]}],minutes:30,notices:[]});
 const sz=vi.fn(async(a:TransitPoint,b:TransitPoint,_departAt:string)=>[await plan(network,a,b)]);
 it('步行provider拒絕跨境、過大吸附距離和不完整路網',async()=>{
  const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({code:'Ok',routes:[{duration:100,distance:100,geometry:{coordinates:[[114.1,22.28],[114.14,22.28]]}}],waypoints:[{distance:100}]})});
  await expect(walkRoute(from,to,fetchMock)).rejects.toThrow('核驗');
  await expect(walkRoute(from,{...to,side:'sz'},fetchMock)).rejects.toThrow('跨越');
 });
 it('完整組合兩側路線，深圳段按通關完成後的時間查詢',async()=>{
  const result=await analyzeTransitJourney(request,{load:async()=>portNetwork,hk:plan,sz,configured:()=>true});
  expect(result.routes).toHaveLength(2);expect(result.coverage?.status).toBe('ready');expect(result.coverage?.partialPlans).toHaveLength(0);
  expect(sz.mock.calls[0]?.[2]).toBe('2026-10-16T09:30:00+08:00');
  const journey=result.routes[0]!.candidate.journey;expect(journey.totalMinutes).toBe(120);expect(journey.segments.filter(s=>s.kind==='border_crossing')).toHaveLength(1);
  expect(journey.segments.find(s=>s.border)?.border?.queueMinutesRange).toEqual([15,45]);
 });
 it('缺少深圳服務時只回傳單側路段，不能宣稱完整覆蓋或推薦出發',async()=>{
  const result=await analyzeTransitJourney(request,{load:async()=>portNetwork,hk:plan,sz:async()=>{throw new (await import('@/lib/transit/types')).TransitError('MISSING_KEY','Key missing');},configured:()=>false});
  expect(result.action).toBe('unavailable');expect(result.routes).toHaveLength(0);expect(result.coverage?.partialPlans).toHaveLength(2);expect(result.coverage?.status).toBe('partial');
 });
 it('口岸關閉時不查詢另一側，不提供虛構路線',async()=>{
  const onward=vi.fn();const result=await analyzeTransitJourney({...request,departAt:'2026-10-16T23:50:00+08:00'},{load:async()=>portNetwork,hk:plan,sz:onward,configured:()=>true});
  expect(result.routes).toHaveLength(0);expect(onward).not.toHaveBeenCalled();
 });
 it('離線公共交通不能自動降級成fixture',async()=>{
  const result=await handleJourneyRequest(request);expect(result.status).toBe(503);
 });
});
