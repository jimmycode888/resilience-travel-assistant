import { createRouteDataResolver } from '/workspace/八校黑客松/A部分/app/src/lib/adapters/team-data';
const at='2026-10-14T08:00:00+08:00';let time=Date.parse(at),calls=0;
const conditions={byPort:{},observationsByPort:{},sources:[],notices:[],quality:'fixture'};
const client={resolve:async()=>conditions};
const route={id:'audit-route',journey:{segments:[]}};
const request={departAt:at,origin:'central-exchange-square',destination:'futian-station-sz',mode:'balanced'};
const resolve=createRouteDataResolver({env:{TEAM_LIVE_DATA_ENABLED:'1'},now:()=>time,client:client as any,trafficProvider:null,weatherProvider:{id:'audit-weather',provides:['weather'],fetch:async()=>{calls++;return{weather:{condition:'clear',warning:null,rainfallMmPerHour:null,temperatureC:25,note:null,updatedAt:at}}}}});
async function main(){
 const first=await resolve(route as any,request as any);time+=300000;
 const second=await resolve(route as any,request as any);
 console.log(JSON.stringify({probe:'resolver cache after 5min',weatherFetchCount:calls,firstUpdatedAt:first?.updatedAt,secondUpdatedAt:second?.updatedAt,secondExpired:Date.parse(second!.expiresAt)<=time}));
 const hang=createRouteDataResolver({env:{TEAM_LIVE_DATA_ENABLED:'1'},client:client as any,trafficProvider:null,weatherProvider:{id:'hang',provides:['weather'],fetch:async()=>new Promise(()=>{})}});
 console.log(JSON.stringify({probe:'weather deadline',result:await Promise.race([hang(route as any,request as any).then(()=> 'resolved'),new Promise(r=>setTimeout(()=>r('still_pending_after_120ms'),120))])}));
}
main();
