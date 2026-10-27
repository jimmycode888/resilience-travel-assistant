import { REFERENCE_JOURNEY_VISUALS, type JourneyVisualSpec } from '@/lib/integration/ui-contract';
import type { JourneySegment } from '@/lib/types/journey';
import type { TeamRouteResult } from '@/lib/types/team-integration';
export const VISUALS:JourneyVisualSpec={...REFERENCE_JOURNEY_VISUALS,risk:{...REFERENCE_JOURNEY_VISUALS.risk,high:{...REFERENCE_JOURNEY_VISUALS.risk.high,symbol:'■'},critical:{...REFERENCE_JOURNEY_VISUALS.risk.critical,symbol:'◆'}}};
export const CONFIDENCE={low:'低',medium:'中',high:'高'};
export const FACTORS={weather:'天氣',crowd:'人流',disruption:'服務中斷',transfer:'換乘',border:'通關'};
export const MODES={mtr:'港鐵',bus:'巴士',minibus:'小巴',tram:'電車',ferry:'渡輪',walk:'步行',cross_border_bus:'跨境巴士',hsr:'高鐵'};
export const QUALITY={fixture:'演示估算 · fixture',cached:'快取資料 · cached',live:'實時來源 · live'};
export function hk(value:string){return new Intl.DateTimeFormat('zh-HK',{timeZone:'Asia/Hong_Kong',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}
export function leafletGeometry(segment:JourneySegment):[number,number][]{return segment.geometry.map(([lon,lat])=>[lat,lon]);}
export function routeStyle(route:TeamRouteResult,segment:JourneySegment,selected:boolean){return {color:!route.eligible?VISUALS.unavailable.color:segment.kind==='border_crossing'?VISUALS.border.color:VISUALS.risk[route.assessment.risk.level].color,dashArray:!route.eligible?'2 5':segment.kind==='border_crossing'?VISUALS.border.dashPattern:undefined,weight:selected?7:4,opacity:selected?1:0.5};}
/** Matching per-port envelope overrides segment queue, as in A's ETA calculation. */
export function displayQueue(route:TeamRouteResult,segment:JourneySegment){const injected=route.data?.value.border;return injected&&injected.portId===segment.border?.portId?injected:segment.border;}
export function actionable(route:TeamRouteResult){return route.eligible&&route.meetsDeadline!==false;}
