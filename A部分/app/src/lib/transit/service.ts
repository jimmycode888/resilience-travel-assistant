import { loadHkNetwork } from './hk-data';
import { routeHk } from './hk-router';
import { amapConfigured, routeShenzhen } from './amap';
import { findPlace } from '../geo/places';
import { findPort, isPortOpen } from '../geo/ports';
import { addMinutes } from '../time';
import { evaluate } from '../journey/analysis';
import { TransitError, type HkNetwork, type TransitPoint, type TransitPlan, type TransitLeg } from './types';
import type { JourneyAnalysis, JourneyAnalysisRequest } from '../types/journey-analysis';
import type { CandidateRoute } from '../types/route';
import type { Journey, JourneySegment, PlaceRef } from '../types/journey';

// Shenzhen entry/exit POIs queried 2026-10-17 and converted GCJ-02→WGS84.
// IDs: B0FFG9KBI4/B0FFHODP60 (SZ Bay), B0K1DZFFXD/B0KG37PESD (Liantang).
// POI reference points, not surveyed pedestrian channel geometry.
export const TRANSIT_PORTS = [
  { id: 'shenzhen-bay', name: '深圳灣口岸', stopId: '12728', sz: { name: '深圳灣口岸入境出口（高德POI）', lat: 22.505004823, lon: 113.944971511, side: 'sz' as const }, szOutbound: { name: '深圳灣口岸出境入口（高德POI）', lat: 22.505225115, lon: 113.944274390, side: 'sz' as const } },
  { id: 'heung-yuen-wai', name: '香園圍／蓮塘口岸', stopId: '10000179', sz: { name: '蓮塘口岸入境出口（高德POI）', lat: 22.555559197, lon: 114.154316379, side: 'sz' as const }, szOutbound: { name: '蓮塘口岸出境入口（高德POI）', lat: 22.555750797, lon: 114.154099804, side: 'sz' as const } },
] as const;
interface Dependencies {
  load: typeof loadHkNetwork;
  hk: (network: HkNetwork, from: TransitPoint, to: TransitPoint, departAt: string) => Promise<TransitPlan>;
  sz: typeof routeShenzhen;
  configured: () => boolean;
}
const dependencies: Dependencies = { load: loadHkNetwork, hk: routeHk, sz: routeShenzhen, configured: amapConfigured };
const ref = (point: TransitPoint): PlaceRef => ({ ...point, id: `transit-${point.side}-${point.lat}-${point.lon}`, kind: 'point', sideSource: 'registry' });
export function journeyFromLegs(id: string, label: string, departAt: string, legs: TransitLeg[], portId?: string, crossingIndex?: number): Journey {
  let time = departAt;
  const segments: JourneySegment[] = legs.map((leg, index) => {
    const durationMinutes = Math.ceil(leg.minutes);
    const arriveAt = addMinutes(time, durationMinutes);
    const crossing = portId !== undefined && index === crossingIndex;
    const segment: JourneySegment = { id: `${id}-${index}`, mode: leg.mode, kind: crossing ? 'border_crossing' : leg.from.side === 'hk' ? 'in_hk' : 'in_sz', line: leg.line, from: ref(leg.from), to: ref(leg.to), departAt: time, arriveAt, durationMinutes, geometry: leg.geometry, viaStations: [leg.from.name, leg.to.name], viaDistricts: [] };
    if (crossing) segment.border = { portId, queueMinutesRange: [15, 45], confidence: 'low', note: '規劃預留 15–45 分鐘，非實測排隊；請核對當日口岸情況。' };
    time = arriveAt;
    return segment;
  });
  return { id, label, segments, departAt, arriveAt: time, totalMinutes: legs.reduce((sum, l) => sum + Math.ceil(l.minutes), 0), crossesBorder: Boolean(portId), borderPortIds: portId ? [portId] : [] };
}

/** Public transit never falls back to fixture routes. Partial legs are distinct from complete candidates. */
export async function analyzeTransitJourney(request: JourneyAnalysisRequest, supplied: Partial<Dependencies> = {}): Promise<JourneyAnalysis> {
  const dep = { ...dependencies, ...supplied };
  const candidates: CandidateRoute[] = [];
  const failures: { port: string; code: string; message: string }[] = [];
  const partialPlans: { port: string; legs: TransitLeg[]; minutes: number }[] = [];
  const notices: string[] = ['公共交通參考規劃：香港班次來自官方靜態資料；風險、客流及通關排隊仍是低信心規則估算，非即時預測。', '目前跨境組合覆蓋深圳灣、香園圍／蓮塘兩個道路口岸；未接入港鐵，羅湖及落馬洲鐵路口岸不參與推薦。', '香港公交折線僅連接官方站點；口岸通道及深圳側出口座標為參考值，請依現場旅檢標識通行。'];
  let network: HkNetwork | undefined;
  const from = request.originPlace ?? findPlace(request.origin);
  const to = request.destinationPlace ?? findPlace(request.destination);
  try { network = await dep.load(); }
  catch { failures.push({ port: '香港資料', code: 'DATA_UNAVAILABLE', message: '香港公交資料未載入，請重新匯入 GTFS。' }); }
  const add = (id: string, label: string, legs: TransitLeg[], portId?: string, crossingIndex?: number) => candidates.push({ id, label, provider: 'transit', quality: 'cached', journey: journeyFromLegs(id, label, request.departAt, legs, portId, crossingIndex) });
  const record = (port: string, error: unknown) => failures.push({ port, code: error instanceof TransitError ? error.code : 'PROVIDER_ERROR', message: error instanceof TransitError ? error.message : '交通服務暫時不可用，沒有轉用演示路線。' });
  if (!from || !to) throw new TransitError('NO_ROUTE', '起終點座標未確認。');
  const checkedPorts: string[] = [];
  if (from.side === to.side) {
    try {
      if (from.side === 'hk' && network) {
        const plan = await dep.hk(network, from, to, request.departAt); notices.push(...plan.notices); add('hk-public-transit', '香港公開公交方案', plan.legs);
      } else if (from.side === 'sz') {
        const plans = await dep.sz(from, to, request.departAt); plans.slice(0, 3).forEach((p, i) => add(`sz-amap-${i}`, `深圳公交方案 ${i + 1}`, p.legs)); notices.push(...plans[0]!.notices);
      }
    } catch (error) { record(from.side === 'hk' ? '香港境內' : '深圳境內', error); }
  } else if (network) {
    // Sequential port queries keep public walking-router request volume modest.
    for (const port of TRANSIT_PORTS) {
      checkedPorts.push(port.id);
      const stop = network.stops.find(s => s.id === port.stopId);
      if (!stop) { record(port.name, new TransitError('DATA_UNAVAILABLE', '官方資料中缺少口岸公交站點。')); continue; }
      const hkPoint: TransitPoint = { ...stop, side: 'hk' };
      try {
        const hkStart = from.side === 'hk';
        const szPoint = hkStart ? port.sz : port.szOutbound;
        let first: TransitPlan;
        if (hkStart) first = await dep.hk(network, from, hkPoint, request.departAt);
        else first = (await dep.sz(from, szPoint, request.departAt))[0]!;
        const firstArrival = addMinutes(request.departAt, first.minutes);
        const facts = findPort(port.id)!;
        // Reserve channel walking + conservative queue before querying the onward leg.
        const onwardAt = addMinutes(firstArrival, 15 + 45);
        if (!isPortOpen(facts, firstArrival) || !isPortOpen(facts, onwardAt)) throw new TransitError('NO_ROUTE', '預計抵達或完成通關時口岸未開放，請調整出發時間。');
        partialPlans.push({ port: `${port.name} · ${hkStart ? '香港段' : '深圳段'}（不含通關及另一側）`, legs: first.legs, minutes: first.minutes });
        const second = hkStart ? (await dep.sz(szPoint, to, onwardAt))[0]! : await dep.hk(network, hkPoint, to, onwardAt);
        const crossFrom = hkStart ? hkPoint : szPoint, crossTo = hkStart ? szPoint : hkPoint;
        const crossing: TransitLeg = { mode: 'walk', line: '旅檢通道（步行預留，非導航）', from: crossFrom, to: crossTo, minutes: 15, geometry: [[crossFrom.lon, crossFrom.lat], [crossTo.lon, crossTo.lat]], approximate: true };
        // 45 minutes queue is queried upstream; represented as an explicit wait before onward transit.
        const reserve: TransitLeg = { mode: 'walk', line: '通關排隊預留 45 分鐘（估算）', from: crossTo, to: crossTo, minutes: 45, geometry: [[crossTo.lon, crossTo.lat], [crossTo.lon, crossTo.lat]], approximate: true };
        add(`public-${port.id}`, `經${port.name} · 公開交通方案`, [...first.legs, crossing, reserve, ...second.legs], port.id, first.legs.length);
        partialPlans.pop();
        notices.push(...first.notices, ...second.notices);
      } catch (error) { record(port.name, error); }
    }
  }
  const routes = evaluate(candidates, request, true);
  const hold = request.scenario === 'heavy_rain';
  const primary = hold ? undefined : routes.find(r => r.eligible && r.meetsDeadline !== false) ?? routes.find(r => r.eligible);
  const backup = primary && routes.find(r => r.eligible && r.candidate.id !== primary.candidate.id);
  const shenzhenConfigured = dep.configured();
  if (!shenzhenConfigured) notices.push('深圳公交服務尚未配置高德 Key；跨境結果只展示已確認的單側路段，不作完整行程推薦。');
  const status = candidates.length && !failures.length ? 'ready' : candidates.length || partialPlans.length ? 'partial' : 'unavailable';
  return { request, routes, recommendedRouteId: primary?.candidate.id ?? null, action: hold ? 'hold' : primary ? 'go' : 'unavailable', departureOptions: [], bestDeparture: null, planB: !hold && backup ? { routeId: backup.candidate.id, trigger: '主路線或口岸不可用時，核對服務後切換。', reason: backup.candidate.label } : null, quality: 'cached', routing: 'transit', coverage: { status, hkStops: network?.meta.stopCount ?? 0, hkRoutes: network?.meta.routeCount ?? 0, shenzhenConfigured, checkedPorts, failures, partialPlans }, notices: [...new Set(notices)], sources: [
    { label: '香港運輸署 GTFS', url: 'https://data.gov.hk/en-data/dataset/hk-td-tis_11-pt-headway-en', updatedAt: network?.meta.feedDate ?? '', note: `已匯入 ${network?.meta.stopCount ?? 0} 個站點、${network?.meta.routeCount ?? 0} 條線路；中途站時間為插值，不含港鐵重鐵。` },
    { label: '高德官方公交接口', url: 'https://developer.amap.com/api/webservice/guide/api/direction', updatedAt: new Date().toISOString(), note: shenzhenConfigured ? '已配置 Key；實際可用性以每次查詢結果為準。' : '未配置 Key，深圳及完整跨境方案尚不可用。' },
    { label: 'OSM 步行路網', url: 'https://routing.openstreetmap.de/about.html', updatedAt: new Date().toISOString(), note: '接駁步行經專用 foot profile 核驗；公共服務沒有 SLA。' },
  ] };
}
