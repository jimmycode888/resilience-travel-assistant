/** D's HTTP decoder, separate from A's shared contracts. No demo-to-team cast. */
import { z } from 'zod';
import { parseArriveBy } from '@/lib/time';
import { findPlace } from '@/lib/geo/places';
import type { TeamJourneyRequest, TeamJourneyResult } from '@/lib/types/team-integration';
const confidence = z.enum(['low', 'medium', 'high']);
const quality = z.enum(['live', 'cached', 'fixture']);
const mode = z.enum(['fastest', 'reliable', 'less_crowded', 'balanced']);
const text = z.string();
// Round trip calendar validation even for ISO values (Date.parse normalizes Feb 30).
export const iso = text.refine(v => {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(v);
  return !!m && !!m[1] && parseArriveBy(m[1]).ok && Number.isFinite(Date.parse(v));
}, '無效或缺時區的時間');
const url = text.url().refine(v => /^https?:\/\//.test(v)).nullable();
const nonnegative = z.number().finite().nonnegative();
const range = z.tuple([nonnegative, nonnegative]).refine(v => v[0] <= v[1]);
const queue = z.object({ portId: text, queueMinutesRange: range, confidence, note: text.nullable() });
const point = z.object({ id: text, name: text, lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), kind: z.enum(['station','port','landmark','address','point']), side: z.enum(['hk','sz']), sideSource: z.enum(['registry','port','heuristic']) });
const segment = z.object({ id: text, mode: z.enum(['walk','mtr','bus','minibus','tram','ferry','cross_border_bus','hsr']), kind: z.enum(['in_hk','border_crossing','in_sz']), line: text.nullable(), from: point, to: point, departAt: iso, arriveAt: iso, durationMinutes: nonnegative, geometry: z.array(z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)])).min(2), viaStations: z.array(text), viaDistricts: z.array(text), border: queue.optional() });
const journey = z.object({ id: text, label: text, segments: z.array(segment), departAt: iso, arriveAt: iso, totalMinutes: nonnegative, crossesBorder: z.boolean(), borderPortIds: z.array(text) });
const factor = z.object({ id: z.enum(['weather','crowd','disruption','transfer','border']), score: nonnegative.max(100), level: confidence, weight: nonnegative.max(1), contribution: nonnegative, claim: text, evidence: text, source: text, sourceUrl: url });
const weights = z.object({weather:nonnegative,crowd:nonnegative,disruption:nonnegative,transfer:nonnegative,border:nonnegative});
const breakdown = weights.extend({overall:nonnegative,weights,factors:z.array(factor).length(5),confidence});
const risk = z.object({ routeId:text,label:text,mode,crossesBorder:z.boolean(),score:nonnegative,level:confidence,breakdown,quality,notices:z.array(text) });
const evidence = z.object({claim:text,evidence:text,source:text,sourceUrl:url});
const reliability = z.object({routeId:text,label:text,mode,onTimeConfidence:confidence,confidenceNote:text.min(1),etaRange:z.tuple([iso,iso]).refine(v=>Date.parse(v[0])<=Date.parse(v[1])),riskLevel:confidence,ruleScore:nonnegative,factors:z.array(evidence),quality,notices:z.array(text)});
const context = z.object({ quality, weather:z.object({condition:z.enum(['clear','cloudy','rain','heavy_rain','storm']),warning:text.nullable(),updatedAt:iso}).nullish(),service:z.object({status:z.enum(['ok','delayed','disrupted','unknown']),delayMinutes:nonnegative,crowding:z.enum(['low','medium','high','unknown']),updatedAt:iso.optional()}).nullish(), incidents:z.array(z.object({id:text,title:text,detail:text,affects:z.array(text).optional()})).optional(),crowd:z.object({level:z.enum(['low','medium','high','critical']),confidence,evidence:text}).nullish(),border:queue.nullish() });
export const requestSchema = z.object({ origin:text.min(1),destination:text.min(1),departAt:iso,mode,arriveBy:iso.optional(),preferPortId:text.optional(),modes:z.array(segment.shape.mode).optional() }).strict().superRefine((v,ctx)=>{
  if (!findPlace(v.origin)||!findPlace(v.destination)||findPlace(v.origin)?.id===findPlace(v.destination)?.id) ctx.addIssue({code:'custom',path:['origin'],message:'請選擇不同的已收錄起終點。'});
  if(v.arriveBy && Date.parse(v.arriveBy)<=Date.parse(v.departAt))ctx.addIssue({code:'custom',path:['arriveBy'],message:'到達期限必須晚於出發。'});
}) satisfies z.ZodType<TeamJourneyRequest>;
const route = z.object({candidate:z.object({id:text,label:text,provider:z.enum(['osrm','corridor','fixture']),quality,journey}),assessment:z.object({routeId:text,label:text,mode,rankScore:nonnegative,timeScore:nonnegative,riskScore:nonnegative,durationMinutes:nonnegative,risk,reliability}),eligible:z.boolean(),exclusions:z.array(text),meetsDeadline:z.boolean().nullable(),data:z.object({routeId:text,value:context,source:text,sourceUrl:url,updatedAt:iso,expiresAt:iso,confidence,quality}).nullable()});
export const resultSchema = z.object({request:requestSchema,evaluatedAt:iso,routes:z.array(route),recommendedRouteId:text.nullable(),notices:z.array(text),decision:z.object({action:z.enum(['go','hold','unavailable']),primaryRouteId:text.nullable(),backupRouteIds:z.array(text),departureWindow:z.object({start:iso,end:iso,confidence,evidence:text}).nullable(),explanations:z.array(z.object({routeId:text,text,evidence:z.array(text)})),notices:z.array(text)}).strict().nullable()}).strict().superRefine((v,ctx)=>{
  const ids=v.routes.map(r=>r.candidate.id);
  const allowed=new Set(v.routes.filter(r=>r.eligible).map(r=>r.candidate.id));
  const bad=(message:string)=>ctx.addIssue({code:'custom',message});
  if(new Set(ids).size!==ids.length)bad('重複路線');
  for(const r of v.routes){
    if(r.assessment.routeId!==r.candidate.id||r.assessment.risk.routeId!==r.candidate.id||r.assessment.reliability.routeId!==r.candidate.id||(r.data&&r.data.routeId!==r.candidate.id))bad('路線 ID 不一致');
    if(new Set(r.assessment.risk.breakdown.factors.map(f=>f.id)).size!==5)bad('五因子不完整');
  }
  if(v.recommendedRouteId&&!allowed.has(v.recommendedRouteId))bad('無效基礎推薦');
  const d=v.decision;
  if(d){
    if([d.primaryRouteId,...d.backupRouteIds].some(id=>id!==null&&!allowed.has(id)))bad('決策引用不可行路線');
    if(d.action==='go'&&!d.primaryRouteId)bad('go 缺少主路');
    if(d.departureWindow&&(Date.parse(d.departureWindow.end)<Date.parse(d.departureWindow.start)||Date.parse(d.departureWindow.start)<Date.parse(v.request.departAt)))bad('無效出發窗口');
  }
}) satisfies z.ZodType<TeamJourneyResult>;
export function decodeTeamResult(value:unknown):TeamJourneyResult {
  const parsed=resultSchema.safeParse(value);
  if(!parsed.success)throw new Error('回應不符合正式團隊契約，請重試或聯絡團隊。');
  return parsed.data;
}
