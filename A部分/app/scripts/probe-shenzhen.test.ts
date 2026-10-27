import { it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { amapConfigured, routeShenzhen } from '../src/lib/transit/amap';
import { searchShenzhen } from '../src/lib/transit/amap-search';
import { TRANSIT_PORTS, analyzeTransitJourney } from '../src/lib/transit/service';
import type { AddressPlace } from '../src/lib/geo/address-search';
import type { JourneyAnalysis } from '../src/lib/types/journey-analysis';
import { TransitError } from '../src/lib/transit/types';
const summarize = (r: JourneyAnalysis) => ({ completeRoutes: r.routes.length, eligibleRoutes: r.routes.filter(x => x.eligible).length, minutes: r.routes.map(x => x.candidate.journey.totalMinutes), ports: r.routes.flatMap(x => x.candidate.journey.borderPortIds), failures: r.coverage?.failures ?? [] });
it('深圳八區地址與境內公交、雙向跨境實測', async () => {
 const cases = [ ['福田','深圳市民中心'], ['南山','深圳大学'], ['龙华','深圳北站'], ['罗湖','深圳站'], ['宝安','宝安中心'], ['龙岗','龙岗区人民医院'], ['坪山','坪山站'], ['光明','光明城站'] ];
 const results = [];
 const departAt = '2026-10-17T08:00:00+08:00';
 if (!amapConfigured()) throw new Error('Configure the server key before running live Shenzhen coverage.');
 const central: AddressPlace = {id:'central-sample',name:'中環交易廣場樣本',lat:22.284,lon:114.159,side:'hk',kind:'address',coordinatesVerified:false};
 for (const [district,query] of cases.slice(0, Number(process.env.TRANSIT_SAMPLE_LIMIT) || cases.length)) {
  const result: Record<string, unknown> = {district,query};
  let destination: AddressPlace | undefined;
  try { destination=(await searchShenzhen(query!))[0]; result.addressFound=Boolean(destination); if(destination) {result.selectedName=destination.name; result.address=destination.address;} }
  catch { result.addressFound=false; result.addressFailure='Address provider failed'; }
  if (destination) {
   await new Promise(resolve=>setTimeout(resolve,600));
   try {const plans=await routeShenzhen(TRANSIT_PORTS[0].sz,destination,departAt);result.shenzhen={success:true,plans:plans.length,minutes:plans[0]?.minutes};}
   catch(error){result.shenzhen={success:false,code:error instanceof TransitError?error.code:'ERROR',reason:error instanceof TransitError?error.message:'Provider failed'};}
   for (const reverse of [false,true]) {
    await new Promise(resolve=>setTimeout(resolve,600));
    const from=reverse?destination:central, to=reverse?central:destination;
    const journey=await analyzeTransitJourney({origin:from.id,originPlace:from,destination:to.id,destinationPlace:to,departAt,scenario:'normal',mode:'balanced',routing:'transit'});
    result[reverse?'szToHk':'hkToSz']=summarize(journey);
   }
  }
  results.push(result);
  console.log(JSON.stringify({district,addressFound:result.addressFound,shenzhen:result.shenzhen,hkToSz:result.hkToSz,szToHk:result.szToHk}));
 }
 const routePassed=(r:Record<string,unknown>,key:string)=>Number((r[key] as {eligibleRoutes?:number}|undefined)?.eligibleRoutes)>0;
 const summary={total:results.length,addressFound:results.filter(r=>r.addressFound).length,shenzhen:results.filter(r=>(r.shenzhen as {success?:boolean}|undefined)?.success).length,hkToSz:results.filter(r=>routePassed(r,'hkToSz')).length,szToHk:results.filter(r=>routePassed(r,'szToHk')).length};
 const report={summary,testedAt:new Date().toISOString(),departAt,definition:'Eight named Shenzhen POI samples, selected first returned Shenzhen candidate; Shenzhen Bay to POI and Central to/from POI via two road ports. Provider route availability is not a field validation or all-address guarantee.',results};
 await mkdir('docs/transit',{recursive:true});await writeFile('docs/transit/shenzhen-coverage.json',JSON.stringify(report,null,2)+'\n');
});
