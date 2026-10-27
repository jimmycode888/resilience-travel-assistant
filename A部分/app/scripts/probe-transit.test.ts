import { it } from 'vitest';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { loadHkNetwork } from '../src/lib/transit/hk-data';
import { routeHk } from '../src/lib/transit/hk-router';
import { mkdir, writeFile } from 'node:fs/promises';
import { TRANSIT_PORTS, analyzeTransitJourney } from '../src/lib/transit/service';
import { amapConfigured } from '../src/lib/transit/amap';
import type { TransitPoint } from '../src/lib/transit/types';
it('公開交通地理樣本探測：分開報告香港參考方案與完整跨境覆蓋', async () => {
 const network = await loadHkNetwork();
 const samples = [
  ['中環',22.284,114.159],['尖沙咀',22.298,114.172],['旺角',22.319,114.169],['沙田',22.382,114.188],
  ['屯門',22.394,113.974],['元朗',22.445,114.029],['荃灣',22.371,114.117],['將軍澳',22.307,114.261],
  ['大埔',22.449,114.165],['東涌',22.29,113.941],['西貢',22.381,114.272],['赤柱',22.219,114.213],
 ] as const;
 const port = TRANSIT_PORTS[0]; const stop = network.stops.find(s=>s.id===port.stopId)!;
 const results = [];
 for (const [name,lat,lon] of samples) {
  const from:TransitPoint = {name,lat,lon,side:'hk'}; const started=Date.now();
  try { const plan=await routeHk(network,from,{...stop,side:'hk'},'2026-10-16T08:00:00+08:00'); results.push({name,referenceRoute:true,minutes:plan.minutes,lines:plan.legs.filter(l=>l.mode!=='walk').map(l=>l.line),walkingVerified:true,ms:Date.now()-started}); }
  catch(error) {results.push({name,referenceRoute:false,reason:error instanceof Error?error.message:String(error),ms:Date.now()-started});}
  console.log(results.at(-1));
 }
 const crossBorder = [];
 for (const [name,lat,lon] of samples.slice(0,3)) {
  const result=await analyzeTransitJourney({origin:`sample-${name}`,originPlace:{id:`sample-${name}`,name,lat,lon,side:'hk',kind:'address',coordinatesVerified:false},destination:'futian-station-sz',departAt:'2026-10-16T08:00:00+08:00',mode:'balanced',scenario:'normal',routing:'transit'});
  crossBorder.push({name,completeRoutes:result.routes.length,failures:result.coverage?.failures,partialLegs:result.coverage?.partialPlans?.length});
 }
 const passed=results.filter(r=>r.referenceRoute).length;
 const report={testedAt:new Date().toISOString(),feed:network.meta,definition:'12 district-coordinate samples to Shenzhen Bay HK bus terminal, 08:00 Friday; verified pedestrian access, static reference bus timetable. This is not address-search or all-city coverage.',hkReference:{passed,total:results.length,rate:passed/results.length,results},shenzhenConfigured:amapConfigured(),crossBorder:{passed:crossBorder.filter(r=>r.completeRoutes>0).length,total:crossBorder.length,results:crossBorder},limitations:['Sample coverage does not guarantee every address','No MTR heavy rail','Only two road ports in composed routes','No live vehicle ETA','Missing provider key must not count as covered']};
 await mkdir('docs/transit',{recursive:true}); await writeFile('docs/transit/coverage.json',JSON.stringify(report,null,2)+'\n');
 console.log(`HK reference ${passed}/${results.length}; cross-border ${report.crossBorder.passed}/${crossBorder.length}`);
});
